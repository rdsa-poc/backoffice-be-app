import http from "node:http";

import {
  createRouteContext,
  mapRouteError,
  readJsonBody,
  resolveRoute,
  type RouteContext,
} from "../api/routes.ts";
import {
  loadAppConfig,
  type AppConfig,
} from "../infrastructure/config/app-config.ts";
import { MissingConfigurationError } from "../shared/errors/missing-configuration-error.ts";

export type StartupOptions = {
  configLoader?: () => AppConfig;
  error?: (message: string) => void;
  log?: (message: string) => void;
};

export function createServer(config: AppConfig): http.Server {
  const context = createRouteContext(config);

  return http.createServer((request, response) => {
    void handleRequest(request, response, context);
  });
}

export function startServer(config: AppConfig): Promise<http.Server> {
  const server = createServer(config);
  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => resolve(server));
  });
}

export function formatStartupFailure(error: unknown): string[] {
  if (error instanceof MissingConfigurationError) {
    return [
      "bof-be failed to start because required configuration is missing.",
      `Missing values: ${error.missingKeys.join(", ")}`,
      "Update the shared ../.env file or export the missing values before starting bof-be.",
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
    log(
      `bof-be shell listening on http://${config.host}:${config.port} for ${config.environmentName}`,
    );
    return 0;
  } catch (caughtError) {
    for (const message of formatStartupFailure(caughtError)) {
      error(message);
    }

    return 1;
  }
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: RouteContext,
): Promise<void> {
  try {
    const requestBody = await readJsonBody(request);
    const routeResponse = resolveRoute(
      request.method,
      request.url,
      context.config,
      context.repository,
      requestBody,
    );
    jsonResponse(response, routeResponse.statusCode, routeResponse.payload);
  } catch (error) {
    jsonResponse(response, ...mapRouteError(error));
  }
}

function jsonResponse(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
