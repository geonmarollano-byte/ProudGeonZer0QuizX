import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
describe('Published assignments', () => {
  let f, h, p, other, game;
  before(async () => {
    f = await fixture();
    h = await f.activate('hostdemo', 'owner');
    p = await f.activate('player01', 'assigned');
    other = await f.activate('player02', 'unassigned');
    game = (
      await h.session
        .post('/api/host/games')
        .send({
          title: 'Assigned quiz',
          status: 'PUBLISHED',
          questions: [{ text: 'Pick one', options: ['A', 'B'], correctIndex: 0 }],
        })
        .expect(201)
    ).body;
  });
  after(async () => f?.close());
  it('only lists safe player profiles to hosts and accepts only valid player IDs and published games', async () => {
    const { body: list } = await h.session.get('/api/host/players').expect(200);
    assert.equal(list.length, 10);
    assert.deepEqual(Object.keys(list[0]).sort(), ['activated', 'active', 'id', 'username']);
    await p.session.get('/api/host/players').expect(403);
    await p.session
      .post(`/api/host/games/${game.id}/assignments`)
      .send({ playerIds: [p.user.id] })
      .expect(403);
    const endpoint = `/api/host/games/${game.id}/assignments`;
    await h.session
      .post(endpoint)
      .send({ playerIds: [p.user.id, h.user.id] })
      .expect(400);
    await h.session
      .post(endpoint)
      .send({ playerIds: [2147483647] })
      .expect(400);
    const { body: d } = await h.session
      .post('/api/host/games')
      .send({ title: 'Draft', questions: [] })
      .expect(201);
    await h.session
      .post(`/api/host/games/${d.id}/assignments`)
      .send({ playerIds: [p.user.id] })
      .expect(409);
    assert.equal((await h.session.get(endpoint)).body.assignments.length, 0);
  });
  it('serializes concurrent duplicate assignments, scopes visibility, and locks assigned games', async () => {
    const path = `/api/host/games/${game.id}`,
      results = await Promise.all(
        [1, 2, 3].map(() =>
          h.session.post(path + '/assignments').send({ playerIds: [p.user.id, p.user.id] }),
        ),
      );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 201]);
    assert.equal((await h.session.get(path + '/assignments')).body.assignments.length, 1);
    assert.equal((await p.session.get('/api/player/games')).body.length, 1);
    assert.equal((await other.session.get('/api/player/games')).body.length, 0);
    await p.session.get(`/api/player/games/${game.id}`).expect(200);
    await other.session.get(`/api/player/games/${game.id}`).expect(404);
    await h.session
      .post(path + '/unpublish')
      .send({ revision: game.revision })
      .expect(409);
    await h.session.delete(path).send({ revision: game.revision }).expect(409);
  });
  it('keeps assignments attached to pending players after their first-login rename', async () => {
    const { body: list } = await h.session.get('/api/host/players');
    const pending = list.find((u) => u.username === 'player09');
    assert.equal(pending.activated, false);
    await h.session
      .post(`/api/host/games/${game.id}/assignments`)
      .send({ playerIds: [pending.id] })
      .expect(201);
    const activated = await f.activate('player09', 'new_arrival');
    const { body } = await activated.session.get('/api/player/games').expect(200);
    assert.deepEqual(
      body.map((g) => g.id),
      [game.id],
    );
  });
});
