// Operator-only provisioning. There is deliberately no HTTP route for this action.
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { databaseUrl } from '../server/src/config/env.js';
import { openPool } from '../server/src/db/pool.js';
import { username, password } from '../server/src/services/credentials.js';
export async function createUser(pool, role, name, temporaryPassword) {
  const values = [
    z.enum(['HOST', 'PLAYER']).parse(role),
    username.parse(name),
    await bcrypt.hash(password.parse(temporaryPassword), 12),
  ];
  await pool.query('INSERT INTO users(role,username,password_hash) VALUES ($1,$2,$3)', values);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = openPool(databaseUrl(process.env));
  try {
    await createUser(pool, process.argv[2], process.argv[3], process.env.QUIZX_TEMP_PASSWORD);
    console.log('Account created. First-login activation is required.');
  } catch {
    console.error(
      'Account not created. Check role (HOST/PLAYER), unique username, QUIZX_TEMP_PASSWORD, and the migrated database.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
