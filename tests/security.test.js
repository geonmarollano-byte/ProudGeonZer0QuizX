import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { fixture, freshPassword } from './fixture.js';
import { createApp } from '../server/src/app.js';
import { configFrom } from '../server/src/config/env.js';
import { createUser } from '../database/create-user.js';
import { grade } from '../server/src/services/attempts.js';
import { migrate } from '../database/migrate.js';

describe('Configuration and scoring units', () => {
  it('rejects missing, placeholder and insecure production configuration without echoing the secret', () => {
    const env = {
      DATABASE_URL: 'postgresql://db.internal/quizx',
      APP_BASE_URL: 'https://quiz.example',
      NODE_ENV: 'production',
      SESSION_SECRET: randomBytes(48).toString('hex'),
    };
    for (const bad of [
      { SESSION_SECRET: '' },
      { DATABASE_URL: 'not-a-database' },
      { APP_BASE_URL: 'http://quiz.example' },
      { TRUST_PROXY_HOPS: 'all' },
      { PORT: '70000' },
    ])
      assert.throws(() => configFrom({ ...env, ...bad }));
    assert.ok(configFrom(env).production);
  });
  it('maps choices to question IDs, not positions, and produces a valid zero score', () => {
    const questions = [
      {
        id: 1,
        points: 2,
        options: [
          { id: 3, isCorrect: false },
          { id: 4, isCorrect: true },
        ],
      },
      {
        id: 2,
        points: 8,
        options: [
          { id: 5, isCorrect: false },
          { id: 6, isCorrect: true },
        ],
      },
    ];
    const result = grade(questions, [
      { questionId: 2, optionId: 5 },
      { questionId: 1, optionId: 3 },
    ]);
    assert.deepEqual([result.score, result.maxScore], [0, 10]);
    assert.throws(() =>
      grade(questions, [
        { questionId: 2, optionId: 3 },
        { questionId: 1, optionId: 5 },
      ]),
    );
  });
});
describe('Security boundaries on real PostgreSQL', () => {
  let f;
  before(async () => {
    f = await fixture();
  });
  after(async () => f?.close());
  it('enforces HTTPS, secure cookie flags, and a failure limit on credential changes', async () => {
    const app = createApp({
      pool: f.pool,
      config: {
        ...f.config,
        production: true,
        preview: false,
        origin: 'https://quiz.example',
        proxyHops: 1,
      },
    });
    await request(app).get('/api/health').expect(400);
    await request(app).get('/api/health').set('X-Forwarded-Proto', 'https').expect(200);
    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .set('X-QuizX-Request', 'workspace')
      .send({ username: 'player05', password: f.secrets.playerPassword })
      .expect(204);
    assert.ok(
      ['Secure', 'HttpOnly', 'SameSite=Lax'].every((s) =>
        response.headers['set-cookie'][0].includes(s),
      ),
    );
    const session = await f.signIn('player05');
    for (let i = 0; i < 10; i++) await session.post('/api/auth/activate').send({}).expect(400);
    await session.post('/api/auth/activate').send({}).expect(429);
  });
  it('invalidates both idle and absolute-expired sessions', async () => {
    for (const kind of ['idle', 'absolute']) {
      const s = await f.signIn('player04');
      const { body: u } = await s.get('/api/auth/me');
      await f.pool.query(
        kind === 'idle'
          ? "UPDATE sessions SET expire=now()-interval '1 minute' WHERE sess->>'uid'=$1"
          : `UPDATE sessions SET sess=jsonb_set(sess::jsonb,'{born}','0')::json WHERE sess->>'uid'=$1`,
        [String(u.id)],
      );
      await s.get('/api/auth/me').expect(401);
    }
  });
  it('isolates games, assignments and results between hosts, including offline-provisioned accounts', async () => {
    const pass = freshPassword();
    await createUser(f.pool, 'HOST', 'second_host', pass);
    await assert.rejects(createUser(f.pool, 'HOST', 'second_host', freshPassword()));
    const second = await f.signIn('second_host', pass),
      newPassword = freshPassword();
    await second
      .post('/api/auth/activate')
      .send({ newUsername: 'other_owner', newPassword, confirmPassword: newPassword })
      .expect(200);
    const first = await f.activate('hostdemo', 'first_owner'),
      p = await f.activate('player08', 'test_player');
    const { body: g } = await first.session
      .post('/api/host/games')
      .send({
        title: 'Private game',
        status: 'PUBLISHED',
        questions: [{ text: 'A?', options: ['A', 'B'], correctIndex: 0 }],
      })
      .expect(201);
    await second.get(`/api/host/games/${g.id}`).expect(404);
    await second
      .post(`/api/host/games/${g.id}/assignments`)
      .send({ playerIds: [p.user.id] })
      .expect(404);
    await first.session
      .post(`/api/host/games/${g.id}/assignments`)
      .send({ playerIds: [p.user.id] })
      .expect(201);
    await p.session.post(`/api/player/games/${g.id}/attempts`).send({}).expect(201);
    const play = (await p.session.get(`/api/player/games/${g.id}`)).body;
    await p.session
      .post(`/api/player/attempts/${play.attemptId}/submit`)
      .send({
        answers: [{ questionId: play.questions[0].id, optionId: play.questions[0].options[0].id }],
      })
      .expect(200);
    for (const path of ['games', 'results'])
      assert.deepEqual((await second.get(`/api/host/${path}`).expect(200)).body, []);
    await second.get(`/api/host/games/${g.id}/assignments`).expect(404);
    await second.get('/api/host/games/0').expect(400);
  });
  it('preserves a login, final score and assignment across PostgreSQL and app restarts; migrations rerun safely', async () => {
    const temp = freshPassword();
    await createUser(f.pool, 'HOST', 'storage_host', temp);
    const h = await f.activate('storage_host', 'storage_owner', temp),
      p = await f.activate('player10', 'storage_player');
    const { body: g } = await h.session
      .post('/api/host/games')
      .send({
        title: 'Persistence check',
        status: 'PUBLISHED',
        questions: [{ text: 'Choose A', options: ['A', 'B'], correctIndex: 0 }],
      })
      .expect(201);
    await h.session
      .post(`/api/host/games/${g.id}/assignments`)
      .send({ playerIds: [p.user.id] })
      .expect(201);
    await p.session.post(`/api/player/games/${g.id}/attempts`).send({}).expect(201);
    const play = (await p.session.get(`/api/player/games/${g.id}`)).body;
    const { body: result } = await p.session
      .post(`/api/player/attempts/${play.attemptId}/submit`)
      .send({
        answers: [{ questionId: play.questions[0].id, optionId: play.questions[0].options[0].id }],
      })
      .expect(200);
    const cookie = (await p.session.get('/api/auth/me')).headers['set-cookie'][0].split(';')[0];
    const { pool, app } = await f.restart();
    assert.deepEqual(await migrate(pool), []);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    assert.equal(me.body.username, 'storage_player');
    const recovered = await request(app)
      .get(`/api/player/results/${result.id}`)
      .set('Cookie', cookie)
      .expect(200);
    assert.deepEqual(recovered.body, result);
    const assigned = await request(app)
      .get(`/api/player/games/${g.id}`)
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(assigned.body.progress, 'SUBMITTED');
  });
});
