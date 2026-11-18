import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
describe('Attempts and scoped results', () => {
  let f, h, p, other, unassigned, g, start;
  before(async () => {
    f = await fixture();
    h = await f.activate('hostdemo', 'host_owner');
    p = await f.activate('player01', 'learner_one');
    other = await f.activate('player02', 'learner_two');
    unassigned = await f.activate('player03', 'waiting');
    g = (
      await h.session
        .post('/api/host/games')
        .send({
          title: 'Quick quiz',
          status: 'PUBLISHED',
          questions: [
            { text: 'Q1', points: 3, options: ['A', 'B'], correctIndex: 0 },
            { text: 'Q2', points: 7, options: ['C', 'D'], correctIndex: 1 },
          ],
        })
        .expect(201)
    ).body;
    await h.session
      .post(`/api/host/games/${g.id}/assignments`)
      .send({ playerIds: [p.user.id, other.user.id] })
      .expect(201);
    start = `/api/player/games/${g.id}/attempts`;
  });
  after(async () => f?.close());
  it('blocks unassigned starts, preserves independent attempts, and never returns an answer key', async () => {
    await unassigned.session.post(start).send({}).expect(404);
    await h.session.post(start).send({}).expect(403);
    const [a, b, c] = await Promise.all([
      p.session.post(start).send({}),
      p.session.post(start).send({}),
      other.session.post(start).send({}),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.body.id, b.body.id);
    assert.notEqual(a.body.id, c.body.id);
    const view = (await p.session.get(`/api/player/games/${g.id}`).expect(200)).body;
    assert.equal(view.progress, 'STARTED');
    assert.doesNotMatch(JSON.stringify(view), /is_?correct|correctIndex|answerKey/i);
    await p.session.get(`/api/player/results/${view.attemptId}`).expect(404);
  });
  it('validates complete choices, awards server-computed points exactly once, and isolates histories', async () => {
    assert.ok([200, 201].includes((await p.session.post(start).send({})).status));
    const view = (await p.session.get(`/api/player/games/${g.id}`)).body;
    const path = `/api/player/attempts/${view.attemptId}/submit`,
      answers = view.questions.map((q) => ({ questionId: q.id, optionId: q.options[0].id }));
    await other.session.post(path).send({ answers }).expect(404);
    await p.session.post(path).send({ answers, score: 100 }).expect(400);
    await p.session
      .post(path)
      .send({ answers: [answers[0]] })
      .expect(400);
    await p.session
      .post(path)
      .send({ answers: [answers[0], answers[0]] })
      .expect(400);
    await p.session
      .post(path)
      .send({ answers: [{ ...answers[0], optionId: answers[1].optionId }, answers[1]] })
      .expect(400);
    const sent = await Promise.all([1, 2, 3].map(() => p.session.post(path).send({ answers })));
    assert.deepEqual(sent.map((r) => r.status).sort(), [200, 409, 409]);
    const result = sent.find((r) => r.status === 200).body;
    assert.deepEqual(
      [result.score, result.maxScore, result.correctCount, result.questionCount],
      [3, 10, 1, 2],
    );
    assert.equal((await p.session.get('/api/player/results')).body.length, 1);
    assert.equal((await other.session.get('/api/player/results')).body.length, 0);
    const resultPath = `/api/player/results/${result.id}`;
    await p.session.get(resultPath).expect(200);
    await other.session.get(resultPath).expect(404);
    await p.session.post(start).send({}).expect(409);
    assert.equal((await h.session.get('/api/host/results')).body[0].playerName, p.user.username);
    const {
      rows: [count],
    } = await f.pool.query('SELECT count(*)::int n FROM attempt_answers WHERE attempt_id=$1', [
      result.id,
    ]);
    assert.equal(count.n, 2);
  });
});
