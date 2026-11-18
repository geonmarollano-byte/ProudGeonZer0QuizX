import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openPool, transaction } from '../server/src/db/pool.js';
import { databaseUrl } from '../server/src/config/env.js';
const dir = new URL('./migrations/', import.meta.url);
export async function migrate(pool) {
  const files = (await readdir(dir)).filter((f) => /^\d+_[\w-]+\.sql$/.test(f)).sort();
  return transaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(718321,1)');
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied = new Set(
      (await db.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
    );
    const pending = files.filter((f) => !applied.has(f));
    for (const f of pending) {
      await db.query(await readFile(new URL(f, dir), 'utf8'));
      await db.query('INSERT INTO schema_migrations(version) VALUES ($1)', [f]);
    }
    return pending;
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = openPool(databaseUrl(process.env));
  try {
    console.log(`Applied ${(await migrate(pool)).length} migration(s).`);
  } catch {
    console.error(
      'Migration failed. Check database availability, schema, and migration privileges.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
