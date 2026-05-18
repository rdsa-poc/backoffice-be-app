import type { AppConfig } from "./config.ts";

export type ApiManifest = {
  environmentName: string;
  realtimeBaseUrl: string;
  service: "bof-be";
  capabilities: string[];
  routes: {
    method: "GET" | "POST";
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
    ],
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
