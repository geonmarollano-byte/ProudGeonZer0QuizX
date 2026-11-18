import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { fixture, freshPassword } from './fixture.js';
import { seedDemo } from '../database/seeds/demo.js';
import { homeFor } from '../client/src/services/destination.js';

describe('Authentication on PostgreSQL', () => {
  let f;
  before(async () => {
    f = await fixture();
  });
  after(async () => f?.close());
  it('seeds exactly one host and ten players with individually salted bcrypt hashes', async () => {
    const { rows } = await f.pool.query('SELECT role,password_hash FROM users');
    assert.equal(rows.length, 11);
    assert.equal(rows.filter((u) => u.role === 'HOST').length, 1);
    assert.equal(new Set(rows.map((u) => u.password_hash)).size, 11);
    for (const u of rows)
      assert.ok(
        await bcrypt.compare(
          u.role === 'HOST' ? f.secrets.hostPassword : f.secrets.playerPassword,
          u.password_hash,
        ),
      );
  });
  it('separates simultaneous sessions, forces first-login setup, and destroys only the logged-out session', async () => {
    const [a, b] = await Promise.all([f.signIn('player01'), f.signIn('player02')]);
    const [me, other] = await Promise.all([
      a.get('/api/auth/me').expect(200),
      b.get('/api/auth/me').expect(200),
    ]);
    assert.equal(me.body.username, 'player01');
    assert.equal(other.body.username, 'player02');
    assert.equal(homeFor(me.body), '/activate');
    assert.deepEqual(
      Object.keys(me.body).sort(),
      ['id', 'username', 'role', 'mustChangeCredentials'].sort(),
    );
    const cookie = me.headers['set-cookie'][0].split(';')[0];
    await a.post('/api/auth/logout').send({}).expect(204);
    await request(f.app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    await b.get('/api/auth/me').expect(200);
  });
  it('gives identical generic errors for unknown users and incorrect passwords', async () => {
    const errors = await Promise.all(
      ['hostdemo', 'unknown_user'].map((username) =>
        f.agent().post('/api/auth/login').send({ username, password: freshPassword() }).expect(401),
      ),
    );
    assert.deepEqual(errors[0].body, errors[1].body);
  });
  it('validates activation, uniqueness and role input; rotates session and invalidates previous logins', async () => {
    const a = await f.signIn('hostdemo'),
      other = await f.signIn('hostdemo');
    const cookie = (await a.get('/api/auth/me')).headers['set-cookie'][0].split(';')[0];
    const newPassword = freshPassword(),
      body = { newUsername: 'Studio_Host', newPassword, confirmPassword: newPassword };
    const update = (x) => a.post('/api/auth/activate').send({ ...body, ...x });
    await update({ newUsername: 'PLAYER01' }).expect(409);
    await update({ newUsername: 'hostdemo' }).expect(400);
    await update({ newPassword: 'short' }).expect(400);
    await update({ confirmPassword: freshPassword() }).expect(400);
    await update({ role: 'HOST' }).expect(400);
    const response = await update({}).expect(200);
    assert.equal(homeFor(response.body), '/host');
    assert.ok(
      response.headers['set-cookie'][0].split(';')[0] !== cookie,
      'Activation must issue a new cookie.',
    );
    await other.get('/api/auth/me').expect(401);
    await request(f.app).get('/api/auth/me').set('Cookie', cookie).expect(401);
    assert.equal(await seedDemo(f.pool, f.secrets), 0);
    await f
      .agent()
      .post('/api/auth/login')
      .send({ username: 'hostdemo', password: f.secrets.hostPassword })
      .expect(401);
    const again = await f.signIn('studio_host', newPassword);
    assert.equal((await again.get('/api/auth/me')).body.mustChangeCredentials, false);
  });
  it('routes activated players and requires the current password for settings changes', async () => {
    const { session, user, password } = await f.activate('player03', 'learner_three');
    assert.equal(homeFor(user), '/player');
    await session
      .post('/api/auth/change-credentials')
      .send({ currentPassword: freshPassword(), newUsername: 'renamed_player' })
      .expect(400);
    const other = await f.signIn('learner_three', password);
    const updated = await session
      .post('/api/auth/change-credentials')
      .send({ currentPassword: password, newUsername: 'renamed_player' })
      .expect(200);
    assert.equal(updated.body.username, 'renamed_player');
    await other.get('/api/auth/me').expect(401);
  });
  it('rejects cross-origin, missing custom-header, non-JSON and oversized writes', async () => {
    await f
      .agent()
      .post('/api/auth/login')
      .set('Origin', 'https://unrelated.example')
      .send({})
      .expect(403);
    await request(f.app).post('/api/auth/login').send({}).expect(403);
    await f.agent().post('/api/auth/login').type('form').send({ username: 'test' }).expect(415);
    await f
      .agent()
      .post('/api/auth/login')
      .send({ extra: 'x'.repeat(270000) })
      .expect(413);
  });
});
