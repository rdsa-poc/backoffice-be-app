import type { AppConfig } from "../../infrastructure/config/app-config.ts";
import {
  getMobileStreamProjectionContract,
} from "../streams/stream-service.ts";

export type ApiManifest = {
  environmentName: string;
  realtimeBaseUrl: string;
  service: "bof-be";
  capabilities: string[];
  mobileStreamProjection: ReturnType<typeof getMobileStreamProjectionContract>;
  routes: {
    method: "DELETE" | "GET" | "PATCH" | "POST";
    path: string;
    purpose: string;
  }[];
};

export type SmokeFlowBootstrap = {
  environmentName: string;
  mobileStream: {
    status: string;
    streamId: string;
    title: string;
  };
  participant: {
    participantId: string;
    submissionPath: string;
  };
  quiz: {
    quizId: string;
    title: string;
  };
  smokeFlowId: string;
};

export function buildApiManifest(config: AppConfig): ApiManifest {
  return {
    environmentName: config.environmentName,
    realtimeBaseUrl: config.realtimeBaseUrl,
    service: "bof-be",
    capabilities: [
      "quiz-configuration-validation",
      "quiz-state-propagation",
      "analytics-query-proxy",
      "stream-source-of-truth-crud",
      "stream-mobile-projection-lifecycle-contract",
      config.streamProjectionPersistence?.driver === "firebase-rtdb"
        ? "stream-mobile-projection-rtdb-persistence"
        : "stream-mobile-projection-in-memory-fallback",
    ],
    mobileStreamProjection: getMobileStreamProjectionContract(),
    routes: [
      {
        method: "GET",
        path: "/health",
        purpose: "Readiness probe for the local shell",
      },
      {
        method: "GET",
        path: "/bootstrap/smoke-flow",
        purpose: "Expose the baseline bootstrap data used by the scaffold smoke flow",
      },
      {
        method: "POST",
        path: "/quiz-configurations",
        purpose: "Accept quiz configuration changes for validation and persistence",
      },
      {
        method: "GET",
        path: "/analytics/overview",
        purpose: "Expose a placeholder analytics response for the backoffice UI",
      },
      {
        method: "GET",
        path: "/api/streams",
        purpose: "List the seeded Firestore-aligned stream source-of-truth records",
      },
      {
        method: "POST",
        path: "/api/streams",
        purpose: "Create a draft stream record in the source-of-truth store",
      },
      {
        method: "GET",
        path: "/api/streams/:streamId",
        purpose: "Read a single stream source-of-truth record",
      },
      {
        method: "PATCH",
        path: "/api/streams/:streamId",
        purpose: "Update editable stream fields while preserving stream identity",
      },
      {
        method: "DELETE",
        path: "/api/streams/:streamId",
        purpose: "Delete a non-active stream record from the source-of-truth store",
      },
      {
        method: "POST",
        path: "/api/streams/:streamId/publish",
        purpose: "Publish or republish a stream to the mobile realtime projection target",
      },
      {
        method: "POST",
        path: "/api/streams/:streamId/unpublish",
        purpose: "Remove an active stream from the mobile realtime projection target",
      },
    ],
  };
}

export function buildSmokeFlowBootstrap(config: AppConfig): SmokeFlowBootstrap {
  return {
    environmentName: config.environmentName,
    mobileStream: {
      status: "Ready for bootstrap",
      streamId: "stream-smoke-demo",
      title: "Smoke Flow Demo Stream",
    },
    participant: {
      participantId: "participant-smoke-demo",
      submissionPath: `${config.realtimeBaseUrl}/participant-submissions`,
    },
    quiz: {
      quizId: "quiz-smoke-demo",
      title: "Smoke Flow Demo Quiz",
    },
    smokeFlowId: "baseline-smoke-flow",
  };
}
