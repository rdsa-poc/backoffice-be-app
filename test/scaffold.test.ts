import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";

import {
  buildApiManifest,
  buildSmokeFlowBootstrap,
} from "../src/application/bootstrap/manifest-service.ts";
import { createServer } from "../src/app/runtime.ts";
import { runServerCli } from "../src/app/runtime.ts";
import { resolveRoute } from "../src/api/routes.ts";
import {
  parseEnvironmentFile,
  resolveAppConfig,
} from "../src/infrastructure/config/app-config.ts";
import { createSeededStreamRepository } from "../src/infrastructure/persistence/in-memory-stream-repository.ts";
import { MissingConfigurationError } from "../src/shared/errors/missing-configuration-error.ts";

const sharedEnvUrl = new URL("../../.env", import.meta.url);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const srcRootUrl = new URL("../src/", import.meta.url);
const smokeFlowDocUrl = new URL("../../docs/baseline-smoke-flow.md", import.meta.url);
const backofficeWebSmokeFlowDocUrl = new URL(
  "../../backoffice-web-app/README.md",
  import.meta.url,
);

function createConfig() {
  return {
    appId: "bof-be",
    environmentName: "local",
    host: "127.0.0.1",
    port: 8080,
    realtimeBaseUrl: "http://localhost:5001",
    streamPersistence: {
      driver: "memory" as const,
    },
  };
}

// Test: exposes the backend API boundary and documented startup commands.
// Validates: RDS-AC-002 (RDS-REQ-014 - Provide a runnable application skeleton for bof-be)
test("backoffice backend scaffold exposes the expected routes", () => {
  const readme = readFileSync(readmeUrl, "utf8");
  const manifest = buildApiManifest(createConfig());

  assert.equal(manifest.service, "bof-be");
  assert.equal(manifest.environmentName, "local");
  assert.equal(manifest.realtimeBaseUrl, "http://localhost:5001");
  assert.deepEqual(
    manifest.routes.map((route) => route.path),
    [
      "/health",
      "/bootstrap/smoke-flow",
      "/quiz-configurations",
      "/analytics/overview",
      "/api/streams",
      "/api/streams",
      "/api/streams/:streamId",
      "/api/streams/:streamId",
      "/api/streams/:streamId",
      "/api/streams/:streamId/publish",
      "/api/streams/:streamId/unpublish",
    ],
  );
  assert.deepEqual(manifest.mobileStreamProjection.views.discoveryList, [
    "imageUrl",
    "title",
    "summary",
  ]);
  assert.deepEqual(manifest.mobileStreamProjection.views.detail, [
    "imageUrl",
    "title",
    "summary",
    "streamUrl",
  ]);
  assert.equal(
    manifest.mobileStreamProjection.removalSemantics.missingProjectionRecord,
    "treat-as-removed-from-mobile-discovery",
  );
  assert.equal(
    manifest.mobileStreamProjection.removalSemantics.detailSelectionMissingProjection,
    "show-stream-removed-error-and-return-to-discovery",
  );
  assert.match(readme, /GET `\/api\/streams`/);
  assert.match(readme, /PATCH `\/api\/streams\/:streamId`/);
  assert.match(readme, /DELETE `\/api\/streams\/:streamId`/);
});

// Test: keeps the bof-be runtime aligned with the agreed layered backend baseline.
// Validates: RDS-AC-002, RDS-AC-007 (RDS-REQ-014 - Provide a runnable application skeleton for bof-be, RDS-REQ-019 - Define documented bootstrap steps for local startup)
test("backoffice backend scaffold uses the agreed layered backend structure", () => {
  const readme = readFileSync(readmeUrl, "utf8");

  for (const relativePath of [
    "app/runtime.ts",
    "api/routes.ts",
    "application/bootstrap/manifest-service.ts",
    "application/streams/stream-service.ts",
    "domain/stream/stream.ts",
    "infrastructure/config/app-config.ts",
    "infrastructure/persistence/create-stream-repository.ts",
    "infrastructure/persistence/firestore-stream-repository.ts",
    "infrastructure/persistence/google-service-account-auth.ts",
    "infrastructure/persistence/in-memory-stream-repository.ts",
    "infrastructure/persistence/stream-repository.ts",
    "shared/errors/missing-configuration-error.ts",
    "shared/errors/stream-errors.ts",
  ]) {
    assert.equal(
      existsSync(new URL(relativePath, srcRootUrl)),
      true,
      `${relativePath} should exist in the layered bof-be baseline`,
    );
  }

  for (const removedFlatFile of ["app.ts", "config.ts", "streams.ts"]) {
    assert.equal(
      existsSync(new URL(removedFlatFile, srcRootUrl)),
      false,
      `${removedFlatFile} should no longer be part of the flat bof-be layout`,
    );
  }

  assert.match(readme, /`src\/app`, `src\/api`, `src\/application`, `src\/domain`, `src\/infrastructure`, and `src\/shared`/);
});

// Test: exposes the scaffold bootstrap data for the baseline cross-application smoke flow.
// Validates: RDS-AC-011, RDS-AC-012 (RDS-REQ-023 - Provide a minimal cross-application smoke flow, RDS-REQ-024 - Provide bootstrap data for the initial smoke flow)
test("backoffice backend scaffold exposes smoke flow bootstrap data", () => {
  const bootstrap = buildSmokeFlowBootstrap(createConfig());

  assert.equal(bootstrap.smokeFlowId, "baseline-smoke-flow");
  assert.equal(bootstrap.quiz.quizId, "quiz-smoke-demo");
  assert.equal(bootstrap.mobileStream.streamId, "stream-smoke-demo");
  assert.equal(bootstrap.participant.participantId, "participant-smoke-demo");
  assert.equal(
    bootstrap.participant.submissionPath,
    "http://localhost:5001/participant-submissions",
  );
});

// Test: serves the documented smoke-flow bootstrap and handoff through the backend route contract.
// Validates: RDS-AC-011, RDS-AC-012 (RDS-REQ-023 - Provide a minimal cross-application smoke flow, RDS-REQ-024 - Provide bootstrap data for the initial smoke flow)
test("backoffice backend smoke-flow endpoints stay aligned", async () => {
  const repository = createSeededStreamRepository();
  const bootstrapRoute = await resolveRoute(
    "GET",
    "/bootstrap/smoke-flow",
    createConfig(),
    repository,
  );
  const bootstrap = bootstrapRoute.payload as {
    mobileStream: { streamId: string; title: string };
    participant: { participantId: string; submissionPath: string };
    quiz: { quizId: string };
    smokeFlowId: string;
  };

  assert.equal(bootstrapRoute.statusCode, 200);
  assert.equal(bootstrap.smokeFlowId, "baseline-smoke-flow");
  assert.equal(bootstrap.quiz.quizId, "quiz-smoke-demo");
  assert.equal(bootstrap.mobileStream.streamId, "stream-smoke-demo");
  assert.equal(bootstrap.mobileStream.title, "Smoke Flow Demo Stream");
  assert.equal(bootstrap.participant.participantId, "participant-smoke-demo");
  assert.equal(
    bootstrap.participant.submissionPath,
    "http://localhost:5001/participant-submissions",
  );

  const handoffRoute = await resolveRoute(
    "POST",
    "/quiz-configurations",
    createConfig(),
    repository,
  );
  const handoff = handoffRoute.payload as {
    accepted: boolean;
    nextStep: string;
    quizId: string;
    smokeFlowId: string;
  };

  assert.equal(handoffRoute.statusCode, 202);
  assert.equal(handoff.accepted, true);
  assert.equal(handoff.smokeFlowId, bootstrap.smokeFlowId);
  assert.equal(handoff.quizId, bootstrap.quiz.quizId);
  assert.equal(handoff.nextStep, "http://localhost:5001/quiz-change");
});

// Test: emits browser-friendly CORS headers for preflight and JSON API responses.
// Validates: RDS-AC-022, RDS-AC-023, RDS-AC-024 (HTTP CRUD contract is reachable from bof-web)
test("backoffice backend shell answers CORS preflight and API requests", async () => {
  const server = createServer({
    config: createConfig(),
    repository: createSeededStreamRepository(),
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const port = address.port;

    const preflight = await requestAgainstServer(port, {
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type",
      },
      method: "OPTIONS",
      path: "/api/streams/stream-night-jazz",
    });

    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:3000");
    assert.equal(preflight.headers["access-control-allow-methods"], "GET, POST, PATCH, DELETE, OPTIONS");
    assert.equal(preflight.headers["access-control-allow-headers"], "content-type");

    const apiResponse = await requestAgainstServer(port, {
      headers: {
        origin: "http://localhost:3000",
      },
      method: "GET",
      path: "/api/streams",
    });

    assert.equal(apiResponse.statusCode, 200);
    assert.equal(apiResponse.headers["access-control-allow-origin"], "http://localhost:3000");
    assert.match(apiResponse.body, /stream-morning-news/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

// Test: keeps the baseline smoke-flow contract aligned across the documented path.
// Validates: RDS-AC-011, RDS-AC-012 (RDS-REQ-023 - Provide a minimal cross-application smoke flow, RDS-REQ-024 - Provide bootstrap data for the initial smoke flow)
test("backoffice backend verification assets confirm bootstrap sufficiency", () => {
  const smokeFlowDoc = readFileSync(smokeFlowDocUrl, "utf8");
  const backofficeWebSmokeFlowDoc = readFileSync(backofficeWebSmokeFlowDocUrl, "utf8");

  for (const contractValue of [
    "baseline-smoke-flow",
    "quiz-smoke-demo",
    "stream-smoke-demo",
    "participant-smoke-demo",
  ]) {
    assert.match(smokeFlowDoc, new RegExp(contractValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(smokeFlowDoc, /Smoke Flow Demo Stream/);

  assert.match(
    smokeFlowDoc,
    /curl -sS http:\/\/localhost:8080\/bootstrap\/smoke-flow/,
  );
  assert.match(
    smokeFlowDoc,
    /curl -sS -X POST http:\/\/localhost:8080\/quiz-configurations/,
  );
  assert.match(smokeFlowDoc, /configuration plane only/i);
  assert.match(backofficeWebSmokeFlowDoc, /baseline smoke-flow contract directly on the placeholder screen/i);
  assert.match(
    backofficeWebSmokeFlowDoc,
    /http:\/\/localhost:8080\/bootstrap\/smoke-flow/,
  );
});

// Test: publishes the required development entrypoints.
// Validates: RDS-AC-002 (RDS-REQ-014 - Provide a runnable application skeleton for bof-be)
test("backoffice backend scaffold declares startup commands", () => {
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as {
    scripts: Record<string, string>;
  };
  const readme = readFileSync(readmeUrl, "utf8");

  assert.equal(packageJson.scripts.dev, "node --watch --experimental-strip-types src/server.ts");
  assert.equal(packageJson.scripts.start, "node --experimental-strip-types src/server.ts");
  assert.match(readme, /npm run dev/);
  assert.match(readme, /npm run start/);
  assert.match(readme, /http:\/\/localhost:8080/);
});

// Test: resolves the shared local configuration convention from the shared root contract file.
// Validates: RDS-AC-005 (RDS-REQ-017 - Define a shared environment configuration convention)
test("backoffice backend scaffold resolves the documented environment convention", () => {
  const sharedEnv = readFileSync(sharedEnvUrl, "utf8");
  const environment = parseEnvironmentFile(sharedEnv);
  const config = resolveAppConfig(environment);
  const readme = readFileSync(readmeUrl, "utf8");
  const realtimeBaseUrl = new URL(config.realtimeBaseUrl);

  assert.equal(config.appId, "bof-be");
  assert.equal(config.environmentName, "local");
  assert.equal(config.realtimeBaseUrl, environment.RT_FN_BASE_URL);
  assert.equal(realtimeBaseUrl.protocol, "http:");
  assert.equal(realtimeBaseUrl.port, "5001");
  assert.equal(realtimeBaseUrl.pathname, "/");
  assert.match(readme, /shared root `\.env` file/i);
  assert.match(readme, /RADIOSA_ENVIRONMENT/);
  assert.match(readme, /RT_FN_BASE_URL/);
  assert.match(sharedEnv, /^RT_FN_BASE_URL=http:\/\/[^/\s:]+:5001$/m);
});

// Test: exposes the Firestore emulator contract for local development while keeping memory as the default fallback.
// Validates: RDS-AC-013, RDS-AC-014, RDS-AC-025, RDS-AC-026 (RDS-REQ-025 - Create draft stream records, RDS-REQ-026 - Update stream records without replacing identity, RDS-REQ-035 - Delete stream records from the primary data store)
test("backoffice backend scaffold resolves the Firestore emulator persistence contract", () => {
  const config = resolveAppConfig({
    BOF_BE_STREAM_REPOSITORY: "firestore",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081",
    RADIOSA_ENVIRONMENT: "local",
    RT_FN_BASE_URL: "http://127.0.0.1:5001",
  });
  const readme = readFileSync(readmeUrl, "utf8");

  assert.equal(config.streamPersistence.driver, "firestore");
  if (config.streamPersistence.driver !== "firestore") {
    assert.fail("expected Firestore persistence when BOF_BE_STREAM_REPOSITORY=firestore");
  }

  assert.equal(config.streamPersistence.projectId, "radiosa-poc");
  assert.equal(config.streamPersistence.databaseId, "backoffice");
  assert.equal(config.streamPersistence.location, "europe-west1");
  assert.equal(config.streamPersistence.collectionName, "streams");
  assert.equal(config.streamPersistence.apiBaseUrl, "http://127.0.0.1:8081");
  assert.equal(config.streamPersistence.useEmulator, true);
  assert.match(readme, /BOF_BE_STREAM_REPOSITORY/);
  assert.match(readme, /FIRESTORE_PROJECT_ID/);
  assert.match(readme, /FIRESTORE_EMULATOR_HOST/);
  assert.match(readme, /firebase\.json/);
  assert.match(readme, /\.firebaserc/);
});

// Test: exposes the Firestore cloud contract for the shared Firebase project without a custom bearer token escape hatch.
// Validates: RDS-AC-013, RDS-AC-014, RDS-AC-025, RDS-AC-026 (RDS-REQ-025 - Create draft stream records, RDS-REQ-026 - Update stream records without replacing identity, RDS-REQ-035 - Delete stream records from the primary data store)
test("backoffice backend scaffold resolves the Firestore cloud persistence contract", () => {
  const config = resolveAppConfig({
    BOF_BE_STREAM_REPOSITORY: "firestore",
    FIRESTORE_PROJECT_ID: "radiosa-poc",
    FIRESTORE_SERVICE_ACCOUNT_JSON: '{"client_email":"svc@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"}',
    GOOGLE_APPLICATION_CREDENTIALS: "/tmp/radiosa-poc-service-account.json",
    RADIOSA_ENVIRONMENT: "local",
    RT_FN_BASE_URL: "http://127.0.0.1:5001",
  });
  const readme = readFileSync(readmeUrl, "utf8");

  assert.equal(config.streamPersistence.driver, "firestore");
  if (config.streamPersistence.driver !== "firestore") {
    assert.fail("expected Firestore persistence when BOF_BE_STREAM_REPOSITORY=firestore");
  }

  assert.equal(config.streamPersistence.projectId, "radiosa-poc");
  assert.equal(config.streamPersistence.databaseId, "backoffice");
  assert.equal(config.streamPersistence.location, "europe-west1");
  assert.equal(config.streamPersistence.collectionName, "streams");
  assert.equal(config.streamPersistence.apiBaseUrl, "https://firestore.googleapis.com");
  assert.equal(config.streamPersistence.useEmulator, false);
  assert.equal(
    config.streamPersistence.serviceAccountCredentialFilePath,
    "/tmp/radiosa-poc-service-account.json",
  );
  assert.equal(
    config.streamPersistence.serviceAccountCredentialsJson,
    '{"client_email":"svc@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"}',
  );
  assert.match(readme, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(readme, /FIRESTORE_SERVICE_ACCOUNT_JSON/);
});

// Test: reports exactly which required configuration values are missing.
// Validates: RDS-AC-006 (RDS-REQ-018 - Report missing required configuration values)
test("backoffice backend scaffold reports missing configuration keys", () => {
  assert.throws(
    () => resolveAppConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof MissingConfigurationError);
      assert.deepEqual(error.missingKeys, ["RADIOSA_ENVIRONMENT", "RT_FN_BASE_URL"]);
      assert.match(
        error.message,
        /Missing required configuration values for bof-be: RADIOSA_ENVIRONMENT, RT_FN_BASE_URL/,
      );
      return true;
    },
  );
});

// Test: fails startup with explicit diagnostics naming each missing configuration value.
// Validates: RDS-AC-006 (RDS-REQ-018 - Report missing required configuration values)
test("backoffice backend scaffold reports startup diagnostics for missing config", async () => {
  const startupErrors: string[] = [];
  const startupLogs: string[] = [];

  const exitCode = await runServerCli({
    configLoader: () => {
      throw new MissingConfigurationError("bof-be", [
        "RADIOSA_ENVIRONMENT",
        "RT_FN_BASE_URL",
      ]);
    },
    error: (message) => startupErrors.push(message),
    log: (message) => startupLogs.push(message),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(startupLogs, []);
  assert.deepEqual(startupErrors, [
    "bof-be failed to start because required configuration is missing.",
    "Missing values: RADIOSA_ENVIRONMENT, RT_FN_BASE_URL",
    "Update the shared ../.env file or export the missing values before starting bof-be.",
  ]);
});

async function requestAgainstServer(
  port: number,
  options: {
    headers?: Record<string, string>;
    method: string;
    path: string;
  },
): Promise<{
  body: string;
  headers: http.IncomingHttpHeaders;
  statusCode: number;
}> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers: options.headers,
        host: "127.0.0.1",
        method: options.method,
        path: options.path,
        port,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
            statusCode: response.statusCode ?? 0,
          });
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}
