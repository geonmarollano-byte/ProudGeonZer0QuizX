import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { databaseUrl } from '../../server/src/config/env.js';
import { openPool, transaction } from '../../server/src/db/pool.js';

export async function seedDemo(pool, { hostPassword, playerPassword }) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seeding is disabled in production.');
  if (
    ![hostPassword, playerPassword].every(
      (p) => typeof p === 'string' && p.length >= 10 && Buffer.byteLength(p) <= 72,
    )
  )
    throw new Error('Supply both temporary demo passwords privately (10–72 bytes).');
  return transaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(718321,2)');
    let inserted = 0;
    for (let i = 0; i <= 10; i++) {
      const key = i === 0 ? 'hostdemo' : `player${String(i).padStart(2, '0')}`;
      if ((await db.query('SELECT 1 FROM users WHERE seed_key=$1', [key])).rowCount) continue;
      const hash = await bcrypt.hash(i === 0 ? hostPassword : playerPassword, 12);
      await db.query(
        'INSERT INTO users(seed_key,username,password_hash,role) VALUES ($1::text,$1::text,$2,$3)',
        [key, hash, i === 0 ? 'HOST' : 'PLAYER'],
      );
      inserted++;
    }
    return inserted;
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = openPool(databaseUrl(process.env));
  try {
    console.log(
      `Created ${await seedDemo(pool, { hostPassword: process.env.DEMO_HOST_PASSWORD, playerPassword: process.env.DEMO_PLAYER_PASSWORD })} demo account(s).`,
    );
  } catch {
    console.error(
      'Demo seed failed. Check database, migration, environment, and temporary password settings.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
