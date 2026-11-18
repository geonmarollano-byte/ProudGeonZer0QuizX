import { existsSync } from 'node:fs';
import { configFrom } from './config/env.js';
import { openPool, ready } from './db/pool.js';
import { createApp, clientDir } from './app.js';
let config;
try {
  config = configFrom(process.env);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
if (!existsSync(`${clientDir}index.html`)) {
  console.error('Missing client build. Run npm run build first.');
  process.exit(1);
}
const pool = openPool(config.databaseUrl);
try {
  await ready(pool);
} catch {
  console.error(
    'Database not ready. Check DATABASE_URL, PostgreSQL availability, and run npm run db:migrate.',
  );
  process.exit(1);
}
const app = createApp({ pool, config });
const server = app.listen(config.port, '0.0.0.0', () =>
  console.log(`QuizX Studio listening on port ${config.port}.`),
);
function close() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
