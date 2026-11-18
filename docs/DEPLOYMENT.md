# Deployment runbook

This is a persistent Node web service with a PostgreSQL database, **not** a GitHub Pages site. The Arena service preview is for development and verification. Its local disk is not a production backup or a promise of hosting after a sandbox replacement.

## Database and configuration

1. Provision a supported PostgreSQL service (tested: **18.6**), in the same region/private network as the Node service. Enable durable storage, automatic backups and a tested restore path. Do not expose the database port to browsers.
2. Create a dedicated database and migration owner. For a local, already installed PostgreSQL service, an administrator can use `createuser --pwprompt quizx_owner` and `createdb --owner=quizx_owner quizx`. Managed providers supply equivalent role/database settings. Use TLS with certificate verification for remote connections (provider CA and `sslmode=verify-full` as appropriate); do not disable verification.
3. For local development, copy `.env.example` to root `.env` and replace placeholders, **or** use the local launcher in the [README](../README.md). Production secrets belong in the hosting provider’s secret manager, not a committed file, client build variable, pasted URL, or terminal transcript.

| Variable | Where / requirement |
|---|---|
| `NODE_ENV` | `production` for deployment; `development` for private demos |
| `PORT` | Web service listener, default `3000`; binds `0.0.0.0` |
| `DATABASE_URL` | Required real PostgreSQL URL, including the database name. Use the migration role for migrations and scoped runtime role for the app. |
| `SESSION_SECRET` | Required, random, at least 32 characters. Generate with a cryptographic secret manager (e.g. 48 random bytes encoded base64url); keep stable across restarts. Rotation signs everyone out. |
| `APP_BASE_URL` | Exact public origin with scheme and optional port, no path or credentials. Must be HTTPS in production. |
| `TRUST_PROXY_HOPS` | Default `0`; set `1` or `2` **only** to match the number of trusted proxy hops on every ingress path. Never leave a directly accessible backend trusting arbitrary forwarded headers. |
| `DEMO_HOST_PASSWORD`, `DEMO_PLAYER_PASSWORD` | **Development seed only.** Supply the prompt pack’s temporary demo values privately; unset after seeding. |
| `QUIZX_TEMP_PASSWORD` | **Operator provisioning only.** Strong unique temporary password for one new account. Never put it on a command line. |
| `CHROMIUM_PATH` | Tests only, optional path to an installed compatible Chromium binary. |

## Build and release

Use a supported Node 22 LTS runtime (22.22.3 verified) with npm. In a fresh checkout:

```sh
npm ci --include=dev
npm run build
npm test
# With Chromium installed: npm run test:ui
```

Tests use a disposable real database and a non-root OS account. Run them in a test/build environment, not with production secrets. Browser binaries are not part of the runtime. The build writes `client/dist`; ship that **build artifact** with the server at release time, but do not commit it.

1. Take a backup before schema updates. As a one-off release job with the migration owner’s `DATABASE_URL`, run `npm run db:migrate`. It applies pending `database/migrations/*.sql` in version order under a lock and transaction; rerunning is safe. Never edit an already-applied migration in place.
2. Use a dedicated runtime database role. For example, after creating a login role `quizx_app` with a private password, grant `CONNECT` to the dedicated database, `USAGE` on schema `public`, `SELECT` on `schema_migrations`, and the following application rights **in that database**, as the object owner:

   ```sql
   GRANT SELECT, UPDATE ON users TO quizx_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, games, questions, question_options TO quizx_app;
   GRANT SELECT, INSERT ON game_assignments, attempt_answers TO quizx_app;
   GRANT SELECT, INSERT, UPDATE ON game_attempts TO quizx_app;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO quizx_app;
   ```

   Do not grant superuser, database creation, role management or schema ownership to the web process. Use a separate trusted operator/migration role for provisioning. Review grants with each new migration. Ensure untrusted database roles cannot create objects on the app’s search path.
3. **Do not seed the shared demo passwords for production.** With the private operator role, create each account once. A Bash example using hidden input:

   ```bash
   read -rsp 'Unique temporary password for this account: ' QUIZX_TEMP_PASSWORD; echo
   export QUIZX_TEMP_PASSWORD
   npm run db:create-user -- HOST temporary_host
   unset QUIZX_TEMP_PASSWORD
   ```

   Repeat with `PLAYER` and a different temporary username/password for each Player. Only the role and temporary username are arguments. The CLI inserts new hashed accounts; it cannot reset a password or overwrite an existing user. Deliver credentials through a private channel and require activation. For a private demo use `npm run db:seed` instead, under `NODE_ENV=development`.
4. Configure a TLS-terminating reverse proxy on the public origin to forward **all** routes to the same Node service. Preserve the intended host and supply trusted `X-Forwarded-Proto: https`. Block direct internet access to the backend listener. Production refuses non-HTTPS requests and has Secure, HttpOnly, SameSite=Lax cookies; no wildcard credentialed CORS. Serve from the origin root, not a subdirectory.
5. Run `npm start` under the platform’s process supervisor; restart on failure and handle SIGTERM on rollout. Build dependencies may be removed with `npm prune --omit=dev` **after** building. Do not run watchers or the local database launcher in production. Missing configuration, missing client assets or an unavailable/unmigrated database stop startup safely.
6. Verify `GET /api/health` **through HTTPS** returns `200 {"status":"ready"}`. Check `/login`, protected deep-link redirects, activation, independent Host/Player devices, assignment and scoring with non-production accounts in staging. Avoid logging request bodies, cookies, Authorization headers or environment variables at the proxy/hosting layer.

## Limits and recovery

- The `pg` pool has at most 10 connections per Node process. Bound the number of replicas to the database connection budget. Login throttling is in-process; use a shared limiter before scaling to multiple replicas. Test throughput with realistic quiz sizes and peak traffic.
- Sessions survive normal service restarts in PostgreSQL. If the database is unavailable, the application must not fall back to browser-only state. Restore availability, check readiness, then retry. Keep one backup of data **and** a secure, separate recovery procedure for configuration.
- If login succeeds but no session persists, verify the public origin, proxy hop count, HTTPS forwarding, browser cookie policy and stable session secret. If writes return `403`, check the exact origin and custom request header; do not loosen CORS or disable CSRF checks.
- Roll back the application artifact only when compatible with the installed schema. Otherwise restore a verified database backup and its matching application release during maintenance. There is no destructive automatic down migration.
