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
  publishStream,
  unpublishStream,
  updateStream,
} from "../application/streams/stream-service.ts";
import type { AppConfig } from "../infrastructure/config/app-config.ts";
import {
  createStreamProjectionStore,
} from "../infrastructure/persistence/create-stream-projection-store.ts";
import {
  createStreamRepository,
} from "../infrastructure/persistence/create-stream-repository.ts";
import {
  createSeededStreamProjectionStore,
  type StreamProjectionStore,
} from "../infrastructure/persistence/stream-projection-store.ts";
import { seededStreams } from "../infrastructure/persistence/stream-repository.ts";
import type { StreamRepository } from "../infrastructure/persistence/stream-repository.ts";
import {
  StreamConflictError,
  StreamNotFoundError,
  StreamRealtimeSyncError,
  StreamValidationError,
} from "../shared/errors/stream-errors.ts";

export type RouteResponse = {
  payload: unknown;
  statusCode: number;
};

export type RouteContext = {
  config: AppConfig;
  projectionStore: StreamProjectionStore;
  repository: StreamRepository;
};

export async function createRouteContext(config: AppConfig): Promise<RouteContext> {
  return {
    config,
    projectionStore: createStreamProjectionStore(config),
    repository: await createStreamRepository(config),
  };
}

export async function resolveRoute(
  method: string | undefined,
  url: string | undefined,
  config: AppConfig,
  repository: StreamRepository,
  requestBody: unknown = undefined,
  projectionStore: StreamProjectionStore = createSeededStreamProjectionStore(seededStreams),
): Promise<RouteResponse> {
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
        payload: await listStreams(repository),
        statusCode: 200,
      };
    }

    if (method === "POST" && url === "/api/streams") {
      return {
        payload: await createStream(repository, asObjectPayload(requestBody)),
        statusCode: 201,
      };
    }

    const streamId = readStreamId(url);
    const lifecycleAction = readStreamLifecycleAction(url);

    if (lifecycleAction !== null && method === "POST") {
      return {
        payload:
          lifecycleAction.action === "publish"
            ? await publishStream(repository, projectionStore, lifecycleAction.streamId)
            : await unpublishStream(repository, projectionStore, lifecycleAction.streamId),
        statusCode: 200,
      };
    }

    if (streamId !== null && method === "GET") {
      return {
        payload: await getStream(repository, streamId),
        statusCode: 200,
      };
    }

    if (streamId !== null && method === "PATCH") {
      return {
        payload: await updateStream(repository, streamId, asObjectPayload(requestBody)),
        statusCode: 200,
      };
    }

    if (streamId !== null && method === "DELETE") {
      return {
        payload: await deleteStream(repository, streamId),
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

  if (error instanceof StreamRealtimeSyncError) {
    return [
      error.statusCode,
      {
        action: error.action,
        error: error.code,
        message: error.message,
        projectionTarget: error.projectionTarget,
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

function readStreamLifecycleAction(
  url: string | undefined,
): { action: "publish" | "unpublish"; streamId: string } | null {
  if (url === undefined) {
    return null;
  }

  const match = /^\/api\/streams\/([^/]+)\/(publish|unpublish)$/.exec(url);
  if (match === null) {
    return null;
  }

  return {
    action: match[2] as "publish" | "unpublish",
    streamId: match[1],
  };
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
