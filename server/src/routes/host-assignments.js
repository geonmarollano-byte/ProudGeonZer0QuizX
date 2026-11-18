import { Router } from 'express';
import { idParam, audited } from '../middleware/http.js';
import { ownedGame } from '../services/games.js';
import { assign, assignBody } from '../services/assignments.js';
export function assignmentRoutes(pool) {
  const r = Router();
  r.param('gameId', (req, _res, next, v) => {
    req.gameId = idParam(v);
    next();
  });
  r.get('/players', async (_req, res) =>
    res.json(
      (
        await pool.query(
          `SELECT id,username,NOT must_change_credentials AS activated,is_active AS active FROM users WHERE role='PLAYER' ORDER BY username`,
        )
      ).rows,
    ),
  );
  r.get('/games/:gameId/assignments', async (req, res) => {
    const g = await ownedGame(pool, req.gameId, req.user.id);
    const { rows } = await pool.query(
      `SELECT a.player_id AS "playerId",u.username,a.assigned_at AS "assignedAt",coalesce(t.status,'ASSIGNED') AS progress
      FROM game_assignments a JOIN users u ON u.id=a.player_id LEFT JOIN game_attempts t ON t.game_id=a.game_id AND t.player_id=a.player_id
      WHERE a.game_id=$1 AND a.assigned_by_host_id=$2 ORDER BY u.username`,
      [g.id, req.user.id],
    );
    res.json({ game: { id: g.id, title: g.title, status: g.status }, assignments: rows });
  });
  r.post('/games/:gameId/assignments', async (req, res) => {
    const { playerIds } = assignBody.parse(req.body);
    const result = await assign(pool, req.user.id, req.gameId, playerIds);
    audited('game_assigned', req.user.id);
    res.status(result.added ? 201 : 200).json(result);
  });
  return r;
}
