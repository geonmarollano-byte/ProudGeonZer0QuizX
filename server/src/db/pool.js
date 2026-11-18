import pg from 'pg';
export function openPool(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', () => console.error('[database] idle connection failed'));
  return pool;
}
export async function transaction(pool, operation) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await operation(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function ready(pool) {
  const r = await pool.query("SELECT 1 FROM schema_migrations WHERE version='001_workspace.sql'");
  if (!r.rowCount) throw new Error('Schema not ready.');
}
