import { z } from 'zod';
import { check } from '../middleware/http.js';
import { transaction } from '../db/pool.js';
import { ownedGame } from './games.js';
export const assignBody = z.strictObject({
  playerIds: z
    .array(z.int().positive().max(2147483647))
    .min(1, 'Choose at least one player.')
    .max(500),
});
export async function assign(pool, host, id, ids) {
  const players = [...new Set(ids)].sort((a, b) => a - b);
  return transaction(pool, async (db) => {
    const game = await ownedGame(db, id, host, true);
    check(game.status === 'PUBLISHED', 409, 'Publish this game before assigning players.');
    const { rowCount } = await db.query(
      "SELECT id FROM users WHERE id=ANY($1::int[]) AND role='PLAYER' AND is_active ORDER BY id FOR SHARE",
      [players],
    );
    check(rowCount === players.length, 400, 'Select only active player accounts.');
    const added = await db.query(
      `INSERT INTO game_assignments(game_id,player_id,assigned_by_host_id)
      SELECT $1,id,$3 FROM unnest($2::int[]) AS p(id) ON CONFLICT(game_id,player_id) DO NOTHING`,
      [id, players, host],
    );
    return { added: added.rowCount };
  });
}
export async function playerGame(db, id, player) {
  const {
    rows: [game],
  } = await db.query(
    `SELECT g.id,g.title,g.description,g.status,h.username AS "hostName",a.assigned_at AS "assignedAt",
    (SELECT count(*)::int FROM questions WHERE game_id=g.id) AS "questionCount",(SELECT coalesce(sum(points),0)::int FROM questions WHERE game_id=g.id) AS "maxScore",
    t.id AS "attemptId",coalesce(t.status,'ASSIGNED') AS progress
    FROM game_assignments a JOIN games g ON g.id=a.game_id JOIN users h ON h.id=g.host_id
    LEFT JOIN game_attempts t ON t.game_id=g.id AND t.player_id=a.player_id
    WHERE g.id=$1 AND a.player_id=$2 AND g.status='PUBLISHED'`,
    [id, player],
  );
  check(game, 404, 'Assigned game not found.');
  return game;
}
