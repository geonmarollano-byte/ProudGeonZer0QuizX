const metadata = `g.id,g.title,g.description,g.status,g.created_at AS "createdAt",g.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM questions q WHERE q.game_id=g.id) AS "questionCount"`;
export async function hostGames(db, host, recent = false) {
  return (
    await db.query(
      `SELECT ${metadata},g.revision, (SELECT count(*)::int FROM game_assignments a WHERE a.game_id=g.id) AS "assignedCount"
    FROM games g WHERE g.host_id=$1 ORDER BY g.updated_at DESC,g.id DESC ${recent ? 'LIMIT 4' : ''}`,
      [host],
    )
  ).rows;
}
export async function playerGames(db, player) {
  return (
    await db.query(
      `SELECT ${metadata},h.username AS "hostName",a.assigned_at AS "assignedAt",t.id AS "attemptId",coalesce(t.status,'ASSIGNED') AS "progress"
    FROM game_assignments a JOIN games g ON g.id=a.game_id JOIN users h ON h.id=g.host_id
    LEFT JOIN game_attempts t ON t.game_id=g.id AND t.player_id=a.player_id
    WHERE a.player_id=$1 AND g.status='PUBLISHED' ORDER BY a.assigned_at DESC,g.id DESC`,
      [player],
    )
  ).rows;
}
