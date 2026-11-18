import { before, after, it, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';

describe('Protected dashboards', () => {
  let f;
  before(async () => {
    f = await fixture();
  });
  after(async () => f?.close());
  it('requires a session and completed activation on both dashboards', async () => {
    for (const role of ['host', 'player']) {
      await f.agent().get(`/api/${role}/dashboard`).expect(401);
      const a = await f.signIn(role === 'host' ? 'hostdemo' : 'player02');
      await a.get(`/api/${role}/dashboard`).expect(403);
    }
  });
  it('returns honest empty state data, denies the other role, and does not offer player lookup', async () => {
    const host = await f.activate('hostdemo', 'studio_owner'),
      player = await f.activate('player01', 'new_learner');
    assert.deepEqual((await host.session.get('/api/host/dashboard').expect(200)).body, {
      stats: { total: 0, published: 0, assignments: 0 },
      games: [],
    });
    assert.deepEqual((await player.session.get('/api/player/dashboard').expect(200)).body, {
      games: [],
    });
    await host.session.get('/api/player/dashboard').expect(403);
    await player.session.get('/api/host/dashboard').expect(403);
    await player.session.get('/api/auth/me/1').expect(404);
    await player.session.get('/api/player/games?playerId=1').expect(400);
  });
});
