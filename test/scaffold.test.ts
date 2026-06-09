import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  buildApiManifest,
  buildSmokeFlowBootstrap,
} from "../src/application/bootstrap/manifest-service.ts";
import { runServerCli } from "../src/app/runtime.ts";
import { resolveRoute } from "../src/api/routes.ts";
import {
  parseEnvironmentFile,
  resolveAppConfig,
} from "../src/infrastructure/config/app-config.ts";
import { MissingConfigurationError } from "../src/shared/errors/missing-configuration-error.ts";

const sharedEnvUrl = new URL("../../.env", import.meta.url);
const packageJsonUrl = new URL("../package.json", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const srcRootUrl = new URL("../src/", import.meta.url);
const smokeFlowDocUrl = new URL("../../docs/baseline-smoke-flow.md", import.meta.url);
const bootstrapWalkthroughEvidenceUrl = new URL(
  "../../task-reports/RDS-TASK-010/bootstrap-walkthrough-evidence.md",
  import.meta.url,
);
const backofficeWebReadmeUrl = new URL("../../backoffice-web-app/README.md", import.meta.url);
const realtimeReadmeUrl = new URL("../../realtime-processing-functions/README.md", import.meta.url);
const mobileReadmeUrl = new URL("../../mobile-app/README.md", import.meta.url);
const backofficeWebSmokeFlowDocUrl = new URL(
  "../../backoffice-web-app/README.md",
  import.meta.url,
);

// Test: exposes the backend API boundary and documented startup commands.
// Validates: RDS-AC-002 (RDS-REQ-014 - Provide a runnable application skeleton for bof-be)
test("backoffice backend scaffold exposes the expected routes", () => {
  const readme = readFileSync(readmeUrl, "utf8");
  const manifest = buildApiManifest({
    appId: "bof-be",
    environmentName: "local",
    port: 8080,
    realtimeBaseUrl: "http://localhost:5001",
  });

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
    ],
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
    "infrastructure/persistence/in-memory-stream-repository.ts",
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
  const bootstrap = buildSmokeFlowBootstrap({
    appId: "bof-be",
    environmentName: "local",
    port: 8080,
    realtimeBaseUrl: "http://localhost:5001",
  });

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
test("backoffice backend smoke-flow endpoints stay aligned", () => {
  const bootstrapRoute = resolveRoute("GET", "/bootstrap/smoke-flow", {
    appId: "bof-be",
    environmentName: "local",
    port: 8080,
    realtimeBaseUrl: "http://localhost:5001",
  });
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

  const handoffRoute = resolveRoute("POST", "/quiz-configurations", {
    appId: "bof-be",
    environmentName: "local",
    port: 8080,
    realtimeBaseUrl: "http://localhost:5001",
  });
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
  const environment = parseEnvironmentFile(readFileSync(sharedEnvUrl, "utf8"));
  const config = resolveAppConfig(environment);
  const readme = readFileSync(readmeUrl, "utf8");

  assert.equal(config.appId, "bof-be");
  assert.equal(config.environmentName, "local");
  assert.equal(config.realtimeBaseUrl, "http://localhost:5001");
  assert.match(readme, /shared root `\.env` file/i);
  assert.match(readme, /RADIOSA_ENVIRONMENT/);
  assert.match(readme, /RT_FN_BASE_URL/);
  assert.match(readFileSync(sharedEnvUrl, "utf8"), /^RT_FN_BASE_URL=http:\/\/localhost:5001$/m);
});

// Test: records a clean-developer bootstrap walkthrough with no undocumented setup actions.
// Validates: RDS-AC-007 (RDS-REQ-019 - Define documented bootstrap steps for local startup)
test("backoffice backend verification assets cover the clean bootstrap walkthrough", () => {
  const smokeFlowDoc = readFileSync(smokeFlowDocUrl, "utf8");
  const walkthroughEvidence = readFileSync(bootstrapWalkthroughEvidenceUrl, "utf8");
  const backofficeWebReadme = readFileSync(backofficeWebReadmeUrl, "utf8");
  const backofficeBeReadme = readFileSync(readmeUrl, "utf8");
  const realtimeReadme = readFileSync(realtimeReadmeUrl, "utf8");
  const mobileReadme = readFileSync(mobileReadmeUrl, "utf8");

  assert.match(smokeFlowDoc, /RDS-AC-007/);
  assert.match(
    smokeFlowDoc,
    /\.\.\/task-reports\/RDS-TASK-010\/bootstrap-walkthrough-evidence\.md/,
  );

  assert.match(walkthroughEvidence, /RDS-AC-007/);
  assert.match(walkthroughEvidence, /REV-002/);
  assert.match(walkthroughEvidence, /The walkthrough needed no undocumented setup actions\./);
  assert.match(walkthroughEvidence, /shared root `\.env` file/);
  assert.match(walkthroughEvidence, /npm run dev/);
  assert.match(walkthroughEvidence, /--dart-define-from-file=\.\.\/\.env/);

  for (const readme of [backofficeWebReadme, backofficeBeReadme, realtimeReadme, mobileReadme]) {
    assert.match(readme, /shared root `\.env` file/i);
  }

  assert.match(backofficeWebReadme, /http:\/\/localhost:3000/);
  assert.match(backofficeBeReadme, /http:\/\/localhost:8080/);
  assert.match(realtimeReadme, /http:\/\/localhost:5001/);
  assert.match(mobileReadme, /\.\.\/flutter\/bin\/flutter run -d web-server --web-port 7357/);
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
