import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import request from 'supertest';
import { migrate } from '../database/migrate.js';
import { seedDemo } from '../database/seeds/demo.js';
import { openPool } from '../server/src/db/pool.js';
import { createApp } from '../server/src/app.js';
import { configFrom } from '../server/src/config/env.js';

export const freshPassword = () => `Qx0-${randomBytes(18).toString('hex')}`;
export async function freePort() {
  const s = createServer();
  await new Promise((ok, bad) => s.once('error', bad).listen(0, '127.0.0.1', ok));
  const { port } = s.address();
  await new Promise((ok) => s.close(ok));
  return port;
}
export async function fixture() {
  process.umask(0o077);
  const root = await mkdtemp(join(tmpdir(), 'quizx-test-')),
    port = await freePort(),
    password = freshPassword();
  const postgres = new EmbeddedPostgres({
    databaseDir: join(root, 'data'),
    user: 'tester',
    password,
    port,
    authMethod: 'scram-sha-256',
    postgresFlags: ['-h', '127.0.0.1', '-k', root],
    onLog() {},
    onError() {},
  });
  const appPort = await freePort();
  const config = configFrom({
    DATABASE_URL: `postgresql://tester:${password}@127.0.0.1:${port}/postgres`,
    SESSION_SECRET: randomBytes(40).toString('hex'),
    NODE_ENV: 'test',
    PORT: String(appPort),
    APP_BASE_URL: `http://127.0.0.1:${appPort}`,
  });
  let pool = openPool(config.databaseUrl);
  const close = async () => {
    await pool.end();
    await postgres.stop();
    await rm(root, { recursive: true, force: true });
  };
  try {
    await postgres.initialise();
    await postgres.start();
    await migrate(pool);
    const secrets = { hostPassword: freshPassword(), playerPassword: freshPassword() };
    await seedDemo(pool, secrets);
    const app = createApp({ pool, config });
    const agent = () => request.agent(app).set('X-QuizX-Request', 'workspace');
    const signIn = async (
      username,
      pass = username === 'hostdemo' ? secrets.hostPassword : secrets.playerPassword,
    ) => {
      const session = agent();
      await session.post('/api/auth/login').send({ username, password: pass }).expect(204);
      return session;
    };
    const activate = async (initial, username, tempPassword) => {
      const session = await signIn(initial, tempPassword),
        newPassword = freshPassword();
      const { body: user } = await session
        .post('/api/auth/activate')
        .send({ newUsername: username, newPassword, confirmPassword: newPassword })
        .expect(200);
      return { session, user, password: newPassword };
    };
    const restart = async () => {
      await pool.end();
      await postgres.stop();
      await postgres.start();
      pool = openPool(config.databaseUrl);
      return { pool, app: createApp({ pool, config }) };
    };
    return { config, pool, app, agent, signIn, activate, secrets, close, restart };
  } catch (e) {
    await close();
    throw e;
  }
}
