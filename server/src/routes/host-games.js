import { Router } from 'express';
import { idParam, check, audited } from '../middleware/http.js';
import { transaction } from '../db/pool.js';
import {
  newGame,
  editGame,
  revisionBody,
  currentRevision,
  changePublication,
  ownedGame,
  readQuestions,
  assignedCount,
  writeGame,
} from '../services/games.js';
export function gameRoutes(pool) {
  const r = Router();
  r.param('gameId', (req, _res, next, value) => {
    req.gameId = idParam(value);
    next();
  });
  r.post('/', async (req, res) =>
    res.status(201).json(await writeGame(pool, req.user.id, null, newGame.parse(req.body))),
  );
  r.get('/:gameId', async (req, res) => {
    res.json(
      await transaction(pool, async (db) => {
        const game = await ownedGame(db, req.gameId, req.user.id, true);
        return {
          ...game,
          questions: await readQuestions(db, game.id, true),
          assignedCount: await assignedCount(db, game.id),
        };
      }),
    );
  });
  r.patch('/:gameId', async (req, res) =>
    res.json(await writeGame(pool, req.user.id, req.gameId, editGame.parse(req.body))),
  );
  for (const verb of ['publish', 'unpublish'])
    r.post(`/:gameId/${verb}`, async (req, res) => {
      const { revision } = revisionBody.parse(req.body);
      res.json(
        await changePublication(pool, req.user.id, req.gameId, revision, verb === 'publish'),
      );
    });
  r.delete('/:gameId', async (req, res) => {
    const { revision } = revisionBody.parse(req.body);
    await transaction(pool, async (db) => {
      const g = await ownedGame(db, req.gameId, req.user.id, true);
      currentRevision(g, revision);
      check(
        g.status === 'DRAFT' && (await assignedCount(db, g.id)) === 0,
        409,
        'Only unassigned drafts can be deleted.',
      );
      await db.query('DELETE FROM games WHERE id=$1', [g.id]);
    });
    audited('draft_deleted', req.user.id);
    res.sendStatus(204);
  });
  return r;
}
