# REST API

All paths below are under `/api`. Responses are JSON except `204` (empty). Write requests use `Content-Type: application/json` and `X-QuizX-Request: workspace`, with `{}` for commands with no fields. Browsers use the server’s session cookie, never a client-supplied role. Supply no query parameters. IDs are positive 32-bit integers. Unknown body keys are rejected. Collection responses are arrays unless noted.

## Public and session endpoints

| Method / path | Authorization and input | Success |
|---|---|---|
| `GET /health` | Public. Checks migration marker in PostgreSQL. | `200 {status:"ready"}` or `503 {status:"unavailable"}` |
| `POST /auth/login` | Public; `{username,password}` | `204`; regenerated cookie. Client then reads `/auth/me`. |
| `GET /auth/me` | Authenticated, including pending activation | `{id,username,role,mustChangeCredentials}` for self only |
| `POST /auth/activate` | Activation-pending; `{newUsername,newPassword,confirmPassword}` | `200` own profile, new session. Requires changed username **and** password. |
| `POST /auth/change-credentials` | Activated; `{currentPassword,newUsername?,newPassword?,confirmPassword?}` | `200` own profile, rotated session; at least one change, matching confirmation for a password. |
| `POST /auth/logout` | Authenticated; `{}` | `204`; destroys current session and clears cookie |

No endpoint signs up new users, returns password material, or changes someone else’s credentials.

## Host endpoints

All require an activated `HOST`. Game resources must belong to the caller. The directory lists Player accounts in the shared workspace, not other Hosts.

| Method / path | Input / behavior | Success |
|---|---|---|
| `GET /host/dashboard` | Overview, four most recently updated games | `{stats:{total,published,assignments},games:[…]}` |
| `GET /host/players` | Directory ordered by username | `[{id,username,activated,active}]` |
| `GET /host/games` | Full owned library | Game summaries with question/assignment counts |
| `POST /host/games` | Game document below, no revision | `201` saved metadata (including `id,status,revision`) |
| `GET /host/games/:gameId` | Owned game detail | Metadata, `assignedCount`, ordered questions and options with `isCorrect` |
| `PATCH /host/games/:gameId` | Full edited game document **plus** latest `revision`; drafts only | Saved metadata, incremented revision |
| `DELETE /host/games/:gameId` | `{revision}`; only unassigned drafts; UI confirms | `204` |
| `POST /host/games/:gameId/publish` | `{revision}`; complete draft required | Published metadata |
| `POST /host/games/:gameId/unpublish` | `{revision}`; published with zero assignments only | Draft metadata |
| `GET /host/games/:gameId/assignments` | Review assignments | `{game:{id,title,status},assignments:[{playerId,username,assignedAt,progress}]}` |
| `POST /host/games/:gameId/assignments` | `{playerIds:[…]}`; 1–500 valid active Player IDs; published games only | `{added:n}`; `201` for new rows, `200` if all already assigned |
| `GET /host/results` | Finalized attempts for games owned and assigned by caller | Result summaries plus `playerName` |

### Game document

```json
{
  "title": "Field notes",
  "description": "Choose one answer per question.",
  "status": "DRAFT",
  "questions": [
    {
      "text": "Which unit measures length?",
      "options": ["Metre", "Litre", "Second"],
      "correctIndex": 0,
      "points": 10
    }
  ]
}
```

`title`: 1–120 characters; `description`: optional, ≤2,000. `status` defaults to `DRAFT`; `PUBLISHED` is valid for an immediate publish. Provide a `questions` array (0–50 for draft, 1–50 for publish). Each supplied question must be complete: text 1–1,000, 2–4 nonblank options of ≤300 characters each, one valid zero-based `correctIndex`, integer `points` 1–100 (default 10). Array positions define order. A PATCH replaces the question set; no partial nested edits or client-selected database IDs.

## Player endpoints

All require an activated `PLAYER`. The server derives `player_id` from the session; there is no endpoint for selecting another player. Game reads/starts require that player’s assignment and a published game.

| Method / path | Input / behavior | Success |
|---|---|---|
| `GET /player/dashboard` | Dashboard | `{games:[…]}` |
| `GET /player/games` | Own assignments, newest first | Game summaries with `hostName,assignedAt,questionCount,attemptId,progress` |
| `GET /player/games/:gameId` | Open instructions, or resume a started attempt | Game metadata with `maxScore`; only `STARTED` includes ordered questions and `{id,text}` options; never includes the key |
| `POST /player/games/:gameId/attempts` | `{}`; start or resume | `{id,status:"STARTED"}`, `201` new / `200` already started; `409` if submitted |
| `POST /player/attempts/:attemptId/submit` | `{answers:[{questionId,optionId},…]}`; exactly one valid choice for each question | Final result; a second submission gets `409` |
| `GET /player/results` | Own finalized attempts, newest first | Result summaries |
| `GET /player/results/:attemptId` | Own finalized result only | Single result summary |

Progress is `ASSIGNED`, `STARTED`, or `SUBMITTED`. A result summary has `id` (attempt ID), `gameId,title,score,maxScore,submittedAt,correctCount,questionCount`. No client-calculated score or correctness flag is accepted. Dates are serialized as ISO timestamps.

## Errors

Except readiness, errors use `{ "error": "human-readable message" }`. `400`: invalid request, incomplete quiz or wrong current password; `401`: invalid login/session; `403`: role, activation or same-origin boundary; `404`: missing/not owned/not assigned; `409`: username conflict, stale revision or invalid lifecycle transition; `413`: body over 256 KiB; `415`: unsupported media; `429`: sensitive-action rate limit; `500`: generic server error. Unknown IDs do not reveal another user’s data. Database errors and stack traces are not returned.
