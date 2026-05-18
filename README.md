# Backoffice BE APP

Backend application shell and BFF proxy for backoffice workflows.

## Scope

- validate and persist quiz configuration changes
- coordinate quiz state propagation
- proxy analytics queries to BigQuery for dashboard views

## Development

- Copy `.env.example` to `.env.local` before first start and keep the `RADIOSA_*` names unchanged.
- `RADIOSA_ENVIRONMENT` identifies the local environment name shared across the PoC.
- `RADIOSA_APP_ID` must stay aligned with the repo identifier (`bof-be` here).
- `RADIOSA_REALTIME_BASE_URL` points to the local realtime shell, which defaults to `http://localhost:5001`.
- `RADIOSA_PORT` is optional and overrides the local API port when needed.
- `npm run dev` starts the local API shell on `http://localhost:8080`
- `npm run start` starts the local API shell without file watching
- `npm run verify` runs the scaffold checks for this repository

## Notes

- The shell is intentionally dependency-free so the repo can boot immediately in a clean workspace.
- The runtime boundary is ready to evolve into the planned Node.js + TypeScript Cloud Run service.
- Startup fails fast with a message that lists any missing required `RADIOSA_*` values.

## Smoke Flow

- `GET /bootstrap/smoke-flow` exposes the committed bootstrap payload for the baseline scaffold path.
- `POST /quiz-configurations` returns the realtime handoff URL used by the smoke flow.
- The full bootstrap and smoke-flow steps are documented in `../docs/baseline-smoke-flow.md`.
