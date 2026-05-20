import http from "node:http";
import { pathToFileURL } from "node:url";

import { buildApiManifest, buildSmokeFlowBootstrap } from "./app.ts";
import {
  MissingConfigurationError,
  loadAppConfig,
  type AppConfig,
} from "./config.ts";

export type RouteResponse = {
  payload: unknown;
  statusCode: number;
};

export type StartupOptions = {
  configLoader?: () => AppConfig;
  error?: (message: string) => void;
  log?: (message: string) => void;
};

function jsonResponse(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export function resolveRoute(
  method: string | undefined,
  url: string | undefined,
  config: AppConfig,
): RouteResponse {
  if (method === "GET" && url === "/health") {
    return {
      payload: {
        environmentName: config.environmentName,
        service: "bof-be",
        status: "ok",
      },
      statusCode: 200,
    };
  }

  if (method === "GET" && url === "/manifest") {
    return {
      payload: buildApiManifest(config),
      statusCode: 200,
    };
  }

  if (method === "GET" && url === "/bootstrap/smoke-flow") {
    return {
      payload: buildSmokeFlowBootstrap(config),
      statusCode: 200,
    };
  }

  if (method === "POST" && url === "/quiz-configurations") {
    return {
      payload: {
        accepted: true,
        message: "Quiz configuration accepted by scaffold shell.",
        nextStep: `${config.realtimeBaseUrl}/quiz-change`,
        quizId: "quiz-smoke-demo",
        smokeFlowId: "baseline-smoke-flow",
      },
      statusCode: 202,
    };
  }

  if (method === "GET" && url === "/analytics/overview") {
    return {
      payload: {
        source: "bigquery-proxy-placeholder",
        metrics: [],
      },
      statusCode: 200,
    };
  }

  return {
    payload: { error: "Not Found" },
    statusCode: 404,
  };
}

function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  config: AppConfig,
): void {
  const routeResponse = resolveRoute(request.method, request.url, config);
  jsonResponse(response, routeResponse.statusCode, routeResponse.payload);
}

export function createServer(config: AppConfig): http.Server {
  return http.createServer((request, response) => handleRequest(request, response, config));
}

export function startServer(config: AppConfig): Promise<http.Server> {
  const server = createServer(config);
  return new Promise((resolve) => {
    server.listen(config.port, () => resolve(server));
  });
}

export function formatStartupFailure(error: unknown): string[] {
  if (error instanceof MissingConfigurationError) {
    return [
      "bof-be failed to start because required configuration is missing.",
      `Missing values: ${error.missingKeys.join(", ")}`,
      "Copy .env.example to .env.local or export the missing RADIOSA_* values.",
    ];
  }

  const reason = error instanceof Error ? error.message : String(error);
  return [`bof-be failed to start: ${reason}`];
}

export async function runServerCli(options: StartupOptions = {}): Promise<number> {
  const configLoader = options.configLoader ?? (() => loadAppConfig());
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;

  try {
    const config = configLoader();
    await startServer(config);
    log(`bof-be shell listening on http://localhost:${config.port} for ${config.environmentName}`);
    return 0;
  } catch (caughtError) {
    for (const message of formatStartupFailure(caughtError)) {
      error(message);
    }

    return 1;
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  const exitCode = await runServerCli();
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
