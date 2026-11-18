import { Router } from 'express';
import { authenticated, roleOnly } from '../middleware/session.js';
import { playerGames } from '../services/catalog.js';
import { playerGame } from '../services/assignments.js';
import { readQuestions } from '../services/games.js';
import { submission, startAttempt, finishAttempt, results } from '../services/attempts.js';
import { idParam, empty, check, audited } from '../middleware/http.js';
export function playerRoutes(pool, config) {
  const r = Router();
  r.use(authenticated(pool, config), roleOnly('PLAYER'));
  r.get('/dashboard', async (req, res) =>
    res.json({ games: await playerGames(pool, req.user.id) }),
  );
  r.get('/games', async (req, res) => res.json(await playerGames(pool, req.user.id)));
  r.get('/games/:gameId', async (req, res) => {
    const g = await playerGame(pool, idParam(req.params.gameId), req.user.id);
    res.json({
      ...g,
      ...(g.progress === 'STARTED' ? { questions: await readQuestions(pool, g.id) } : {}),
    });
  });
  r.post('/games/:gameId/attempts', async (req, res) => {
    empty.parse(req.body);
    const { created, attempt } = await startAttempt(pool, idParam(req.params.gameId), req.user.id);
    res.status(created ? 201 : 200).json(attempt);
  });
  r.post('/attempts/:attemptId/submit', async (req, res) => {
    const { answers } = submission.parse(req.body);
    const result = await finishAttempt(pool, idParam(req.params.attemptId), req.user.id, answers);
    audited('attempt_submitted', req.user.id);
    res.json(result);
  });
  r.get('/results', async (req, res) => res.json(await results(pool, req.user.id)));
  r.get('/results/:attemptId', async (req, res) => {
    const [result] = await results(pool, req.user.id, false, idParam(req.params.attemptId));
    check(result, 404, 'Result not found.');
    res.json(result);
  });
  return r;
}
