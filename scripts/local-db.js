// Development only: launch a loopback-only, disk-backed PostgreSQL server.
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

process.umask(0o077);
if (process.env.NODE_ENV === 'production') throw new Error('Local setup is for development only.');
const dir = resolve('.local');
await mkdir(dir, { recursive: true, mode: 0o700 });
const file = `${dir}/dev.env`;
const port = 55432;
if (!existsSync(file)) {
  const secret = () => randomBytes(48).toString('base64url');
  const preview = process.env.E2B_SANDBOX_ID;
  const base = preview ? `https://3000-${preview}.e2b.app` : 'http://localhost:3000';
  await writeFile(
    file,
    `NODE_ENV=development\nPORT=3000\nDATABASE_URL=postgresql://quizx:${secret()}@127.0.0.1:${port}/quizx\nSESSION_SECRET=${secret()}\nAPP_BASE_URL=${base}\nTRUST_PROXY_HOPS=${preview ? 1 : 0}\n`,
    { flag: 'wx', mode: 0o600 },
  );
}
const url = new URL(parseEnv(await readFile(file, 'utf8')).DATABASE_URL);
const databaseDir = `${dir}/postgres`;
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'quizx',
  password: url.password,
  port,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1', '-k', dir],
  onLog() {},
  onError() {
    console.error('Local PostgreSQL reported an error.');
  },
});
if (!existsSync(`${databaseDir}/PG_VERSION`)) await postgres.initialise();
await postgres.start();
const client = postgres.getPgClient('postgres', '127.0.0.1');
await client.connect();
try {
  if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='quizx'")).rowCount)
    await client.query('CREATE DATABASE quizx');
} finally {
  await client.end();
}
console.log(
  'Local PostgreSQL ready. Leave this process running. Connection settings are private in .local/dev.env.',
);
