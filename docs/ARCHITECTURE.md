# Architecture — Upgrade 1.0

```text
Host browser ──────┐                     ┌─ Auth + activation ──── users / sessions
Player browsers ───┼─ HTTPS, one origin ─┼─ Host routes ────────── owned games / assignments
                   │   Node + Express    └─ Player routes ──────── own assignments / attempts
                   └─ Built React app               │
                      static assets          pg pool + transactions
                                                     │
                                              PostgreSQL (durable)
```

The browser sends relative `/api` requests. The Node service serves compiled assets and an HTML fallback for client-side routes; unknown API URLs do not fall through to HTML. React Router chooses the UI **after** `/api/auth/me`. Frontend routes are not access controls.

## Authentication and trust

1. A shared login checks a normalized username and bcrypt hash (cost 12); invalid accounts and wrong passwords get the same response. No passwords or hashes appear in API data.
2. Successful login regenerates a signed, opaque session cookie. Session data lives in PostgreSQL: user ID, credential version, creation time and cookie metadata. Authentication reloads the active account and role from the database on every protected request.
3. An activation-pending session can see its own profile, activate or log out, but cannot enter either role API. Activation updates username/hash/version under a row lock. The version change invalidates old sessions and a new session ID is issued. Settings changes additionally require the current password. Logout destroys only the current session.
4. Idle timeout: **30 minutes**, rolling; absolute lifetime: **12 hours** per issued session. Production cookies are HttpOnly, Secure, SameSite=Lax. HTTPS and a correctly scoped trusted proxy are required. The development-only HTTPS Arena preview uses a partitioned SameSite=None cookie for iframe operation; the production app disallows framing.
5. Write requests require JSON and `X-QuizX-Request: workspace`. An Origin header, if present, must exactly match `APP_BASE_URL`. No cross-origin CORS grants or credentialed wildcard. The custom header forces browser cross-origin requests through a preflight the service does not authorize.
6. Strict request schemas, numeric ID checks, parameterized SQL, a 256 KiB JSON limit, safe errors, no-store API responses, Helmet headers and fixed audit events protect the boundary. Login limits unsuccessful requests per IP; activation/credential changes limit them per authenticated account. Logs omit request bodies, cookies, usernames, hashes and connection strings.

## Relationships

| Table | Relationship / invariant |
|---|---|
| `users` | Normalized unique username; `HOST` or `PLAYER`. Stable ID is independent of username. Optional unique `seed_key` makes seeding safe after renames. |
| `sessions` | Server-managed session records indexed by expiry. Credential version is checked against the active user. |
| `games` | Owned by a Host. Draft revision prevents stale writes. `DRAFT` or `PUBLISHED`. |
| `questions` | Belong to a game; unique position per game; only multiple choice. |
| `question_options` | Belong to a question; ordered options; at most one correct option via partial unique index. Service requires exactly one. |
| `game_assignments` | Unique `(game_id,player_id)`. Composite FK also matches the assigning Host to the game owner. |
| `game_attempts` | Must reference an assignment for the same player/game. One row per pair. Submitted rows require valid score, maximum and timestamp. |
| `attempt_answers` | One selected option per attempt/question. Composite FK keeps the selected option on its question. Grading checks the question belongs to the attempted game. |
| `schema_migrations` | Records applied SQL filenames. The runner serializes migrations using a PostgreSQL advisory lock. |

## Data flows and concurrency

- **Create/edit:** strict complete-game payload → validate title, question count, text, option count, correct index and points → transactional ordered write. A title-only draft is allowed. Invalid partial questions are not saved. Edits lock the owned draft and compare its revision.
- **Publish/assign:** publish validates the saved questions. Assignment takes the same game lock, verifies publication and active `PLAYER` IDs, and inserts with `ON CONFLICT DO NOTHING`. Pending Players can be assigned before activation; their stable IDs keep the assignment after renaming.
- **Lifecycle:** published, unassigned games can return to draft; only unassigned drafts can be deleted. Once assigned, a game is immutable. There is no cascade that discards a player’s completed result.
- **Start/play:** join a published game to an assignment scoped by session identity. Starting the same open attempt returns it rather than creating another. Player question SQL omits the correct-answer column. No claimed player ID or score is accepted from a client.
- **Finalize:** lock the owned attempt; validate every question/option pairing and completeness; compute weighted score from the stored key; insert answers and finalize the attempt in one transaction. A competing submitter sees `409`, not a second score. A failed submission writes nothing.
- **Read:** Host lists/results filter on ownership; the Host directory exposes only safe Player fields. Player lists/results filter on session user ID. Dashboard reads refresh on entry and focus/visibility changes. Separate browsers have separate sessions; tabs sharing a cookie jar are the same login context.

## Code map

`server/src/middleware/` handles sessions and HTTP boundaries. `routes/` composes role guards and handlers; `services/` holds validation, SQL and transactional domain logic. `db/` owns pool lifecycle and transactions. There is no redundant controller layer. The shared schema lives in `database/migrations/`, not in the browser or ORM auto-sync.

`client/src/services/` wraps same-origin fetch, session-expiry events, cancellable reads and double-submit guards. `components/` contains navigation and accessible form/dialog primitives; `pages/` contains workflows. The esbuild script bundles React/CSS/fonts; no production frontend development server is required.

Tests start genuine disposable PostgreSQL processes, not a SQL mock. Unit tests check scoring/config; HTTP tests check guards, sessions, concurrency and restarts. Playwright exercises the built app in separate browser contexts. Load capacity, a production hosting provider, and specific physical Android devices are not certified by these tests.
