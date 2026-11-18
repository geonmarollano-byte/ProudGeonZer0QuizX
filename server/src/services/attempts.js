import { z } from 'zod';
import { transaction } from '../db/pool.js';
import { check } from '../middleware/http.js';
import { readQuestions } from './games.js';
import { playerGame } from './assignments.js';
const id = z.int().positive().max(2147483647);
export const submission = z.strictObject({
  answers: z
    .array(z.strictObject({ questionId: id, optionId: id }))
    .min(1)
    .max(50),
});
export async function startAttempt(pool, gameId, player) {
  return transaction(pool, async (db) => {
    await playerGame(db, gameId, player);
    const inserted = await db.query(
      `INSERT INTO game_attempts(game_id,player_id) VALUES ($1,$2) ON CONFLICT(game_id,player_id) DO NOTHING RETURNING id,status`,
      [gameId, player],
    );
    const attempt =
      inserted.rows[0] ??
      (
        await db.query('SELECT id,status FROM game_attempts WHERE game_id=$1 AND player_id=$2', [
          gameId,
          player,
        ])
      ).rows[0];
    check(attempt.status === 'STARTED', 409, 'This game has already been submitted.');
    return { created: inserted.rowCount === 1, attempt };
  });
}
export function grade(questions, answers) {
  const choices = new Map(answers.map((a) => [a.questionId, a.optionId]));
  check(
    questions.length > 0 &&
      answers.length === questions.length &&
      choices.size === questions.length,
    400,
    'Answer every question exactly once.',
  );
  const rows = questions.map((q) => {
    const option = q.options.find((o) => o.id === choices.get(q.id));
    check(option, 400, 'Choose an option belonging to each question.');
    return {
      questionId: q.id,
      optionId: option.id,
      correct: option.isCorrect,
      points: option.isCorrect ? q.points : 0,
    };
  });
  return {
    rows,
    score: rows.reduce((s, r) => s + r.points, 0),
    maxScore: questions.reduce((s, q) => s + q.points, 0),
  };
}
export async function finishAttempt(pool, attemptId, player, answers) {
  return transaction(pool, async (db) => {
    const {
      rows: [t],
    } = await db.query(
      `SELECT t.game_id,t.status FROM game_attempts t JOIN game_assignments a ON a.game_id=t.game_id AND a.player_id=t.player_id
      JOIN games g ON g.id=a.game_id WHERE t.id=$1 AND t.player_id=$2 AND g.status='PUBLISHED' FOR UPDATE OF t`,
      [attemptId, player],
    );
    check(t, 404, 'Attempt not found.');
    check(t.status === 'STARTED', 409, 'This attempt was already submitted.');
    const { rows, score, maxScore } = grade(await readQuestions(db, t.game_id, true), answers);
    await db.query(
      `INSERT INTO attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded)
      SELECT $1,* FROM unnest($2::int[],$3::int[],$4::boolean[],$5::int[])`,
      [
        attemptId,
        rows.map((r) => r.questionId),
        rows.map((r) => r.optionId),
        rows.map((r) => r.correct),
        rows.map((r) => r.points),
      ],
    );
    await db.query(
      "UPDATE game_attempts SET status='SUBMITTED',score=$2,max_score=$3,submitted_at=now() WHERE id=$1",
      [attemptId, score, maxScore],
    );
    return (await results(db, player, false, attemptId))[0];
  });
}
// Filters are selected from fixed SQL; identities always come from the authenticated user.
export async function results(db, user, host = false, attemptId = null) {
  return (
    await db.query(
      `SELECT t.id,g.id AS "gameId",g.title,t.score,t.max_score AS "maxScore",t.submitted_at AS "submittedAt",
    (SELECT count(*)::int FROM attempt_answers x WHERE x.attempt_id=t.id) AS "questionCount",
    (SELECT count(*)::int FROM attempt_answers x WHERE x.attempt_id=t.id AND x.is_correct) AS "correctCount"
    ${host ? ',p.username AS "playerName"' : ''} FROM game_attempts t JOIN games g ON t.game_id=g.id
    ${host ? 'JOIN users p ON p.id=t.player_id JOIN game_assignments a ON a.game_id=t.game_id AND a.player_id=t.player_id' : ''}
    WHERE t.status='SUBMITTED' AND ${host ? 'g.host_id=$1 AND a.assigned_by_host_id=$1' : 't.player_id=$1'} ${attemptId ? 'AND t.id=$2' : ''}
    ORDER BY t.submitted_at DESC,t.id DESC`,
      attemptId ? [user, attemptId] : [user],
    )
  ).rows;
}
