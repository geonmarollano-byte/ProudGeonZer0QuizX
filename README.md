# ProudGeonZer0QuizX

**Upgrade 1.0 · QuizX Studio** — a host-controlled quiz workspace by **Jun Jun Marollano**. Hosts and Players use one login page. Express identifies their role from PostgreSQL, requires activation on first login, and serves the appropriate dashboard. There is no public registration.

## What’s in this release

- **Host:** overview, draft creation/editing/deletion, ordered multiple-choice questions, publishing, player directory, selected-player assignments, progress and results.
- **Player:** assigned games, instructions, starting/resuming an attempt, one final submission scored on the server, and private result history.
- **Both:** independent server-side sessions, mandatory first-login username/password change, verified credential changes in Settings, and responsive, keyboard-accessible forms and empty states.
- **Persistence:** users, sessions, quizzes, assignments, attempts, and per-question scores live in PostgreSQL. Nothing in local storage authenticates a user or grants access.

## Stack and project layout

Node.js **22 LTS** (tested on 22.22.3), npm workspaces, Express 5, `pg`, SQL migrations, bcrypt, React 19, React Router, organized CSS, and esbuild. The preferred Vite toolchain resolved to an unpatched high-severity `picomatch` advisory during implementation; esbuild keeps React and avoids that dependency. It is a build tool, not a second public web server. Fonts and the quiz-deck illustration are served locally.

```text
client/              React pages, components, API client, CSS, local artwork, build script
server/src/          Express app, config, middleware, routes, domain services, pool
database/           Versioned SQL, migration runner, idempotent demo seed, operator provisioning
scripts/             Local PostgreSQL setup and development watcher
tests/               Unit, real-PostgreSQL HTTP integration and Chromium workflow tests
docs/                Architecture, API reference, user guide, deployment runbook
```

## Run locally

Prerequisites: Node 22.17+ on the 22 LTS line, npm, and PostgreSQL. You can use the bundled **development-only launcher for a real PostgreSQL executable** or an existing server. Run commands from the repository root. Do not run the local launcher or test clusters as root.

```sh
npm ci
npm run db:local
```

Leave that terminal running. The launcher provisions a loopback-only PostgreSQL database on port **55432**, generates private connection/session settings in `.local/dev.env`, and retains data under `.local/postgres` across restarts. It never overwrites an existing `.env`. No production service is provisioned. In a **second terminal**:

```sh
npm run db:migrate
```

**Using an existing database instead?** Skip `db:local`. Create a dedicated database owned by your application/migration account, copy `.env.example` to `.env`, replace the placeholders, and then run `npm run db:migrate`. See [Deployment](docs/DEPLOYMENT.md#database-and-configuration) for database creation and variables. Root `.env` overrides `.local/dev.env`; real process environment variables take precedence. Never put credentials in a client file.

### Seed the private demo

`npm run db:seed` creates `hostdemo` and `player01` through `player10`. Supply the **two temporary demo passwords from the owner’s prompt pack**, not permanent or production passwords. For example, in Bash, use hidden prompts so values are not stored in shell history:

```bash
read -rsp 'Temporary Host demo password: ' DEMO_HOST_PASSWORD; echo
read -rsp 'Temporary Player demo password: ' DEMO_PLAYER_PASSWORD; echo
export DEMO_HOST_PASSWORD DEMO_PLAYER_PASSWORD
npm run db:seed
unset DEMO_HOST_PASSWORD DEMO_PLAYER_PASSWORD
```

Each password is salted and hashed separately. The seed uses immutable seed keys: running it again does **not** recreate renamed users or change existing passwords. The seed is refused with `NODE_ENV=production`. **Do not expose these well-known demo accounts on a public production service.** Use fresh accounts with unique temporary credentials instead.

```sh
npm run dev       # rebuilds client changes; restarts Express on server changes
# Or, to run the built app without watchers:
npm run build
npm start
```

Open `http://localhost:3000/login` locally. In Arena use the **QuizX Studio** service preview. One origin serves both the browser app and `/api`. `GET /api/health` returns `200 {"status":"ready"}` when the service can read the migrated database.

### First login

Sign in using the temporary credentials. Before seeing **any** dashboard, choose a different, unique username and new password. Usernames are normalized to lowercase; new passwords require at least 12 characters, uppercase, lowercase, a digit, and at most 72 UTF-8 bytes. Activation rotates the session, invalidates other sessions using the old credentials, and routes according to the stored role. A new Host sees a create-game action; a new Player sees a clear waiting state unless already assigned a quiz.

## Verification

```sh
npm test                         # disposable disk-backed PostgreSQL clusters; no live DB credentials needed
npm run build
npx playwright install chromium  # one-time browser install; Linux may need --with-deps
npm run test:ui                   # built client + Express + PostgreSQL in Chromium
npm audit
```

An existing compatible Chromium executable can be selected with `CHROMIUM_PATH`. The browser tests use isolated contexts, generated test credentials, and a separate database; they never consume your demo activations. Tests exercise credential/role boundaries, database restart persistence, owner/assignment isolation, draft revisions, concurrent writes, scoring, and the mobile/desktop UI. See [Architecture](docs/ARCHITECTURE.md) for the boundaries under test.

## Operations, limitations and future work

- Production needs an **always-running Node service, HTTPS, a durable PostgreSQL database and backups**. A static site alone cannot run this application. Follow [Deployment](docs/DEPLOYMENT.md); no public deployment is implied by this repository.
- One final submission per player/game. Assigned games cannot be edited, unpublished or deleted. Unsubmitted choices and unsaved editor changes are not autosaved. No timers, live competition, password-reset UI, chat, or public signup.
- More accounts can be provisioned privately with `npm run db:create-user -- PLAYER temporary_name`. See the runbook for the required private password input. This does not update existing accounts.
- Players see new assignments on dashboard entry, return/focus, or **Refresh**, not through push notifications. Capacity depends on the database, compute plan and traffic; the concurrency tests are correctness tests, not a load benchmark.
- Before scaling to multiple replicas or large rosters, add a shared rate-limit store, pagination, and measured load tests. Retakes and archived versions would require an explicit attempt/version policy.

**Guides:** [Using the studio](docs/USER_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [REST API](docs/API.md) · [Deployment](docs/DEPLOYMENT.md)
