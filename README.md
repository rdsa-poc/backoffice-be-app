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
- `RADIOSA_BIND_HOST` is optional and controls which local interface the API binds to. Leave it unset for `127.0.0.1`, or set it to `0.0.0.0` for phone/emulator access.
- `BOF_BE_STREAM_REPOSITORY` selects the stream source-of-truth repository. Leave it unset for the default in-memory scaffold, or set it to `firestore` to make Firestore the active source of truth.
- `FIRESTORE_PROJECT_ID` defaults to `radiosa-poc` for the stream source-of-truth slice.
- `FIRESTORE_DATABASE_ID` defaults to `backoffice`.
- `FIRESTORE_LOCATION` defaults to `europe-west1`.
- `BOF_BE_STREAM_COLLECTION` defaults to `streams`.
- `FIRESTORE_EMULATOR_HOST` switches the repository into emulator mode. Set it to `127.0.0.1:8081` for local Firebase emulation.
- Without `FIRESTORE_EMULATOR_HOST`, the repository runs in cloud mode and targets the Firestore REST API at `https://firestore.googleapis.com` by default.
- `GOOGLE_APPLICATION_CREDENTIALS` should point to a service-account JSON file for cloud mode.
- `FIRESTORE_SERVICE_ACCOUNT_JSON` is an optional inline alternative when a file path is inconvenient.
- `FIRESTORE_API_BASE_URL` stays available as an advanced override for API routing, but cloud authentication is handled through the service account contract rather than a pre-baked bearer token.
- `npm run dev` starts the local API shell on `http://localhost:8080`
- `npm run start` starts the local API shell without file watching
- `npm run verify` runs the scaffold checks for this repository

For the full local stack bootstrap from the workspace root, use `../scripts/start-local-stack.sh`.
By default it keeps `bof-be` on cloud Firestore. Pass `--firestore-mode emulators` when you want the local Firestore and Realtime Database emulators instead.
The root `../firebase.json` and `../.firebaserc` files pin the shared Firebase project contract for the `backoffice` Firestore database.

## Manual Verification

1. Review `../.env` and keep the shared local URLs aligned with the expected shell ports.
2. Start the shell with `npm run dev`.
3. Verify the shell endpoint with `curl -sS http://localhost:8080/health`.

Example Firestore cloud configuration:

```dotenv
BOF_BE_STREAM_REPOSITORY=firestore
FIRESTORE_PROJECT_ID=radiosa-poc
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/radiosa-poc-service-account.json
```

Add `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081` when you want the local emulator instead of the cloud database.

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
- POST `/api/streams/:streamId/publish` promotes a draft or inactive stream to `active`, or republishes an already active stream, and returns the mobile projection target path.
- POST `/api/streams/:streamId/unpublish` removes an active stream from the mobile projection and returns `projectionRemoved: true`.
- Publish and unpublish return `503 STREAM_REALTIME_SYNC_UNAVAILABLE` when the realtime projection mutation cannot be completed, and leave the source-of-truth record unchanged.
- PATCH `/api/streams/:streamId` never mutates the mobile projection; operators must explicitly call publish again to refresh mobile-facing data.


## Notes

- The shell is intentionally dependency-free so the repo can boot immediately in a clean workspace.
- The runtime boundary is ready to evolve into the planned Node.js + TypeScript Cloud Run service.
- Startup fails fast with a message that lists any missing required shared root `.env` values.
- When Firestore is enabled, bof-be seeds the `streams` collection only if the database is empty so the PoC sample catalog remains available without replacing existing source-of-truth records.

## Smoke Flow

- `GET /bootstrap/smoke-flow` exposes the committed bootstrap payload for the baseline scaffold path.
- `POST /quiz-configurations` returns the realtime handoff URL used by the smoke flow.
- The full bootstrap and smoke-flow steps are documented in `../docs/baseline-smoke-flow.md`.
