import type http from "node:http";

import {
  buildApiManifest,
  buildSmokeFlowBootstrap,
} from "../application/bootstrap/manifest-service.ts";
import {
  createStream,
  deleteStream,
  getStream,
  listStreams,
  updateStream,
} from "../application/streams/stream-service.ts";
import type { AppConfig } from "../infrastructure/config/app-config.ts";
import {
  createSeededStreamRepository,
  type StreamRepository,
} from "../infrastructure/persistence/in-memory-stream-repository.ts";
import {
  StreamConflictError,
  StreamNotFoundError,
  StreamValidationError,
} from "../shared/errors/stream-errors.ts";

export type RouteResponse = {
  payload: unknown;
  statusCode: number;
};

export type RouteContext = {
  config: AppConfig;
  repository: StreamRepository;
};

export function createRouteContext(config: AppConfig): RouteContext {
  return {
    config,
    repository: createSeededStreamRepository(),
  };
}

export function resolveRoute(
  method: string | undefined,
  url: string | undefined,
  config: AppConfig,
  repository: StreamRepository = createSeededStreamRepository(),
  requestBody: unknown = undefined,
): RouteResponse {
  try {
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

    if (method === "GET" && url === "/api/streams") {
      return {
        payload: listStreams(repository),
        statusCode: 200,
      };
    }

    if (method === "POST" && url === "/api/streams") {
      return {
        payload: createStream(repository, asObjectPayload(requestBody)),
        statusCode: 201,
      };
    }

    const streamId = readStreamId(url);

    if (streamId !== null && method === "GET") {
      return {
        payload: getStream(repository, streamId),
        statusCode: 200,
      };
    }

    if (streamId !== null && method === "PATCH") {
      return {
        payload: updateStream(repository, streamId, asObjectPayload(requestBody)),
        statusCode: 200,
      };
    }

    if (streamId !== null && method === "DELETE") {
      return {
        payload: deleteStream(repository, streamId),
        statusCode: 200,
      };
    }

    return {
      payload: { error: "Not Found" },
      statusCode: 404,
    };
  } catch (error) {
    const [statusCode, payload] = mapRouteError(error);
    return { payload, statusCode };
  }
}

export async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  if (request.method === "GET" || request.method === "DELETE") {
    return undefined;
  }

  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody === "") {
    return undefined;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new StreamValidationError([
      {
        field: "body",
        message: "Request body must be valid JSON.",
      },
    ]);
  }
}

export function mapRouteError(error: unknown): [number, unknown] {
  if (error instanceof StreamValidationError) {
    return [
      400,
      {
        error: "STREAM_VALIDATION_FAILED",
        issues: error.issues,
        message: error.message,
      },
    ];
  }

  if (error instanceof StreamConflictError) {
    return [
      error.statusCode,
      {
        error: error.code,
        message: error.message,
      },
    ];
  }

  if (error instanceof StreamNotFoundError) {
    return [
      404,
      {
        error: "STREAM_NOT_FOUND",
        message: error.message,
      },
    ];
  }

  const message = error instanceof Error ? error.message : "Unknown server error.";
  return [
    500,
    {
      error: "INTERNAL_SERVER_ERROR",
      message,
    },
  ];
}

function readStreamId(url: string | undefined): string | null {
  if (url === undefined) {
    return null;
  }

  const match = /^\/api\/streams\/([^/]+)$/.exec(url);
  return match?.[1] ?? null;
}

function asObjectPayload(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new StreamValidationError([
      {
        field: "body",
        message: "Request body must be a JSON object.",
      },
    ]);
  }

  return value as Record<string, unknown>;
}
