# Backoffice BE APP

Backend application shell and BFF proxy for backoffice workflows.

## Structure

The scaffold now follows the layered backend baseline under `src/app`, `src/api`, `src/application`, `src/domain`, `src/infrastructure`, and `src/shared`.

- `src/app` owns bootstrap and runtime wiring.
- `src/api` owns the HTTP route boundary and request parsing.
- `src/application` owns smoke-flow/bootstrap orchestration and stream CRUD use cases.
- `src/domain` owns stream models and validation rules.
- `src/infrastructure` owns shared `.env` loading and the seeded repository implementation.
- `src/shared` owns cross-layer error contracts.

## Scope

- validate and persist quiz configuration changes
- coordinate quiz state propagation
- proxy analytics queries to BigQuery for dashboard views
- manage stream source-of-truth records for the backoffice stream slice

## Development

- Use the shared root `.env` file at `../.env` as the local discovery source for this shell.
- `RADIOSA_ENVIRONMENT` identifies the local environment name shared across the PoC.
- `RT_FN_BASE_URL` points to the local realtime shell, which defaults to `http://localhost:5001`.
- `RADIOSA_APP_ID` is optional for `bof-be`; the shell defaults it to the repo identifier when omitted from the shared root contract.
- `RADIOSA_PORT` is optional and overrides the local API port when needed.
- `npm run dev` starts the local API shell on `http://localhost:8080`
- `npm run start` starts the local API shell without file watching
- `npm run verify` runs the scaffold checks for this repository

## Manual Verification

1. Review `../.env` and keep the shared local URLs aligned with the expected shell ports.
2. Start the shell with `npm run dev`.
3. Verify the shell endpoint with `curl -sS http://localhost:8080/health`.

Expected response:

```json
{"environmentName":"local","service":"bof-be","status":"ok"}
```

## Stream API

- GET `/api/streams` lists the seeded stream catalog with `position` and `availableActions`.
- POST `/api/streams` creates a new draft stream from `title`, `summary`, `streamUrl`, and `imageUrl`.
- GET `/api/streams/:streamId` returns the full source-of-truth stream record.
- PATCH `/api/streams/:streamId` updates editable fields and preserves the existing `streamId`.
- DELETE `/api/streams/:streamId` deletes non-active streams and rejects active deletes with `ACTIVE_STREAM_DELETE_FORBIDDEN`.

Detailed `curl` examples for list, create, update, and delete live in `../task-reports/RDS-TASK-022/manual-verification.md`.

## Notes

- The shell is intentionally dependency-free so the repo can boot immediately in a clean workspace.
- The runtime boundary is ready to evolve into the planned Node.js + TypeScript Cloud Run service.
- Startup fails fast with a message that lists any missing required shared root `.env` values.

## Smoke Flow

- `GET /bootstrap/smoke-flow` exposes the committed bootstrap payload for the baseline scaffold path.
- `POST /quiz-configurations` returns the realtime handoff URL used by the smoke flow.
- The full bootstrap and smoke-flow steps are documented in `../docs/baseline-smoke-flow.md`.
