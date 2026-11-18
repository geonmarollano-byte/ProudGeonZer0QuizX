import { z } from 'zod';
import { check } from '../middleware/http.js';
import { transaction } from '../db/pool.js';
const question = z
  .strictObject({
    text: z.string().trim().min(1, 'Enter text for every question.').max(1000),
    points: z.int().min(1).max(100).default(10),
    options: z
      .array(z.string().trim().min(1, 'Answer options cannot be blank.').max(300))
      .min(2)
      .max(4),
    correctIndex: z.int().min(0).max(3),
  })
  .refine(
    (q) => q.correctIndex < q.options.length,
    'Select one valid correct option per question.',
  );
const shape = {
  title: z.string().trim().min(1, 'Give your game a title.').max(120),
  description: z.string().trim().max(2000).default(''),
  questions: z.array(question).max(50),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
};
const publishable = (g) => g.status !== 'PUBLISHED' || g.questions.length > 0;
const message = 'Add at least one complete question before publishing.';
export const revisionBody = z.strictObject({ revision: z.int().positive() });
export const newGame = z.strictObject(shape).refine(publishable, message);
export const editGame = z
  .strictObject({ ...shape, ...revisionBody.shape })
  .refine(publishable, message);
export async function ownedGame(db, id, host, lock = false) {
  const {
    rows: [game],
  } = await db.query(
    `SELECT g.id,g.title,g.description,g.status,g.revision,g.created_at AS "createdAt",g.updated_at AS "updatedAt"
    FROM games g WHERE g.id=$1 AND g.host_id=$2 ${lock ? 'FOR UPDATE' : ''}`,
    [id, host],
  );
  check(game, 404, 'Game not found.');
  return game;
}
export async function readQuestions(db, id, hostView = false) {
  const { rows } = await db.query(
    `SELECT q.id,q.question_text AS text,q.points,o.id AS option_id,o.option_text ${hostView ? ',o.is_correct' : ''}
    FROM questions q JOIN question_options o ON o.question_id=q.id WHERE q.game_id=$1 ORDER BY q.sort_order,o.sort_order`,
    [id],
  );
  const questions = new Map();
  for (const row of rows) {
    if (!questions.has(row.id))
      questions.set(row.id, { id: row.id, text: row.text, points: row.points, options: [] });
    questions
      .get(row.id)
      .options.push({
        id: row.option_id,
        text: row.option_text,
        ...(hostView ? { isCorrect: row.is_correct } : {}),
      });
  }
  return [...questions.values()];
}
export async function assignedCount(db, id) {
  return (await db.query('SELECT count(*)::int AS n FROM game_assignments WHERE game_id=$1', [id]))
    .rows[0].n;
}
export function currentRevision(game, revision) {
  check(
    game.revision === revision,
    409,
    'This game changed in another tab. Reopen it before saving.',
  );
}
export async function writeGame(pool, host, id, data) {
  return transaction(pool, async (db) => {
    if (id) {
      const game = await ownedGame(db, id, host, true);
      currentRevision(game, data.revision);
      check(game.status === 'DRAFT', 409, 'Only drafts can be edited.');
      await db.query(
        'UPDATE games SET title=$2,description=$3,status=$4,updated_at=now(),revision=revision+1 WHERE id=$1',
        [id, data.title, data.description, data.status],
      );
      await db.query('DELETE FROM questions WHERE game_id=$1', [id]);
    } else {
      id = (
        await db.query(
          'INSERT INTO games(host_id,title,description,status) VALUES ($1,$2,$3,$4) RETURNING id',
          [host, data.title, data.description, data.status],
        )
      ).rows[0].id;
    }
    for (const [index, q] of data.questions.entries()) {
      const {
        rows: [{ id: qid }],
      } = await db.query(
        'INSERT INTO questions(game_id,question_text,points,sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
        [id, q.text, q.points, index],
      );
      await db.query(
        `INSERT INTO question_options(question_id,option_text,is_correct,sort_order)
        SELECT $1,txt,(pos-1)=$3::int,pos-1 FROM unnest($2::text[]) WITH ORDINALITY AS options(txt,pos)`,
        [qid, q.options, q.correctIndex],
      );
    }
    return ownedGame(db, id, host);
  });
}
export async function changePublication(pool, host, id, revision, publish) {
  return transaction(pool, async (db) => {
    const g = await ownedGame(db, id, host, true);
    currentRevision(g, revision);
    check(
      g.status === (publish ? 'DRAFT' : 'PUBLISHED'),
      409,
      'The publication status has already changed.',
    );
    if (publish) {
      const {
        rows: [validation],
      } = await db.query(
        `SELECT count(*)>0 AND bool_and(option_count BETWEEN 2 AND 4 AND key_count=1) AS valid
        FROM (SELECT q.id,count(o.id) AS option_count,count(o.id) FILTER (WHERE o.is_correct) AS key_count
        FROM questions q LEFT JOIN question_options o ON o.question_id=q.id WHERE q.game_id=$1 GROUP BY q.id) questions_to_publish`,
        [id],
      );
      check(validation.valid, 400, message);
    } else
      check(
        (await assignedCount(db, id)) === 0,
        409,
        'Assigned games stay published to preserve attempts and scores.',
      );
    await db.query('UPDATE games SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1', [
      id,
      publish ? 'PUBLISHED' : 'DRAFT',
    ]);
    return ownedGame(db, id, host);
  });
}
