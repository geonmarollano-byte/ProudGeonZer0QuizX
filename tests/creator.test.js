import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
const q = { text: 'First question', options: ['One', 'Two'], correctIndex: 1 };
describe('Host quiz lifecycle', () => {
  let f, h;
  before(async () => {
    f = await fixture();
    h = (await f.activate('hostdemo', 'author')).session;
  });
  after(async () => f?.close());
  it('rejects incomplete or oversized questions, wrong answer indices, points, and owner fields', async () => {
    for (const bad of [
      { text: '' },
      { options: ['one'] },
      { options: ['  ', 'two'] },
      { options: ['a', 'b', 'c', 'd', 'e'] },
      { correctIndex: 2 },
      { points: 0 },
      { points: 1.5 },
      { text: 'a'.repeat(1001) },
    ])
      await h
        .post('/api/host/games')
        .send({ title: 'Invalid', questions: [{ ...q, ...bad }] })
        .expect(400);
    await h
      .post('/api/host/games')
      .send({ title: 'No owner override', questions: [], host_id: 2 })
      .expect(400);
    await h.post('/api/host/games').send({ title: ' ', questions: [] }).expect(400);
  });
  it('saves drafts, preserves order, prevents stale edits and protects published quizzes from edits/deletion', async () => {
    let g = (await h.post('/api/host/games').send({ title: 'Science', questions: [] }).expect(201))
      .body;
    const path = `/api/host/games/${g.id}`;
    await h
      .post(path + '/publish')
      .send({ revision: g.revision })
      .expect(400);
    const data = {
      revision: g.revision,
      title: 'Science basics',
      description: 'Choose one.',
      questions: [q, { ...q, text: 'Second question', points: 7 }],
    };
    g = (await h.patch(path).send(data).expect(200)).body;
    await h.patch(path).send(data).expect(409);
    const detail = (await h.get(path).expect(200)).body;
    assert.deepEqual(
      detail.questions.map((q) => [q.text, q.points]),
      [
        ['First question', 10],
        ['Second question', 7],
      ],
    );
    assert.equal(detail.questions[0].options[1].isCorrect, true);
    g = (
      await h
        .post(path + '/publish')
        .send({ revision: g.revision })
        .expect(200)
    ).body;
    assert.equal(g.status, 'PUBLISHED');
    await h
      .patch(path)
      .send({ ...data, revision: g.revision })
      .expect(409);
    await h.delete(path).send({ revision: g.revision }).expect(409);
    g = (
      await h
        .post(path + '/unpublish')
        .send({ revision: g.revision })
        .expect(200)
    ).body;
    await h.delete(path).send({ revision: g.revision }).expect(204);
    await h.get(path).expect(404);
  });
});
