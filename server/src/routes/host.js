import { Router } from 'express';
import { authenticated, roleOnly } from '../middleware/session.js';
import { hostGames } from '../services/catalog.js';
import { gameRoutes } from './host-games.js';
import { assignmentRoutes } from './host-assignments.js';
import { results } from '../services/attempts.js';
export function hostRoutes(pool, config) {
  const r = Router();
  r.use(authenticated(pool, config), roleOnly('HOST'));
  r.get('/dashboard', async (req, res) => {
    const [counts, games] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER(WHERE status='PUBLISHED')::int AS published,
      (SELECT count(*)::int FROM game_assignments WHERE assigned_by_host_id=$1) AS assignments FROM games WHERE host_id=$1`,
        [req.user.id],
      ),
      hostGames(pool, req.user.id, true),
    ]);
    res.json({ stats: counts.rows[0], games });
  });
  r.get('/games', async (req, res) => res.json(await hostGames(pool, req.user.id)));
  r.use('/games', gameRoutes(pool));
  r.use(assignmentRoutes(pool));
  r.get('/results', async (req, res) => res.json(await results(pool, req.user.id, true)));
  return r;
}
