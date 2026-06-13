import assert from "node:assert/strict";
import test from "node:test";

import { resolveRoute } from "../src/api/routes.ts";
import { createStreamProjectionStore } from "../src/infrastructure/persistence/create-stream-projection-store.ts";
import { createStreamRepository } from "../src/infrastructure/persistence/create-stream-repository.ts";
import { seededStreams } from "../src/infrastructure/persistence/stream-repository.ts";

const config = {
  appId: "bof-be",
  environmentName: "local",
  host: "127.0.0.1",
  port: 8080,
  realtimeBaseUrl: "http://localhost:5001",
  streamProjectionPersistence: {
    baseUrl: "http://127.0.0.1:9000",
    driver: "firebase-rtdb",
    namespace: "radiosa-poc-default-rtdb",
    useEmulator: true,
  },
  streamPersistence: {
    apiBaseUrl: "http://127.0.0.1:8081",
    collectionName: "streams",
    databaseId: "backoffice",
    driver: "firestore",
    location: "europe-west1",
    projectId: "radiosa-poc",
    useEmulator: true,
  },
} as const;

const cloudConfig = {
  appId: "bof-be",
  environmentName: "local",
  host: "127.0.0.1",
  port: 8080,
  realtimeBaseUrl: "http://localhost:5001",
  streamPersistence: {
    apiBaseUrl: "https://firestore.googleapis.com",
    collectionName: "streams",
    databaseId: "backoffice",
    driver: "firestore",
    location: "europe-west1",
    projectId: "radiosa-poc",
    serviceAccountCredentialsJson: JSON.stringify({
      client_email: "radiosa-bof-be@radiosa-poc.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nMIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBAMpiIKdf4BE4Hn6Y\ne14/caSdzMawH21GHJw1iRPNaETuFR8Y1SDqYQNQU4+Wcpeus7olROo3iIEmjZZz\npk9x+1QmbsfTq49vQ2kkz4M8XWJwOrx1yWPZ08lm9v2fJV8TCe3xNMne6KaVbUnU\n93ZWkp9whgKg0+i28BTD+9w1vJXhAgMBAAECgYEAoMsH0JM+7c9dgw1Y7w+PFc/9\n01o5DdOnhYCPUTlgf2t9QoCzTHyK6VwXl7xbfSHjT6CuuTu364ya748g8nvHxrEk\nNdwjRfL8gF9lWow2yiR8JvlOo4DSbrnF6+0AIMQghaNtTFlLnarkJ/zvMXHSUyV0\nbeHW8ZaB31piFUmgaFUCQQDoFDtlxGcyICxr+zwHfYhi+a01bPGVJfE7fzdN0YA3\nUZ9FDov/bVmVA3WIz+tlV3yKU2E07iCXMT88RI5wpXm/AkEA3z5T2RBBFLTkqsJm\n3wtkGO82IljznZhiyTyjzco2jvne5ljQgFdzECWw/cOY4XMzLxU1T2Ck8F4F35Pd\n7LWYXwJBAMH+V4BD4nc2CavhgFZKir0hM7Ya8P3Zj4JKXvI/k0uqgNX6yO+kemNj\nVtYb5wr5THNcKz9RZhC76733GJH04IUCQQCHuhg2X4iB810XaKwsrXtFIaLTDSvI\nRA7DdKfOhUPYd5iKibLyZLijN5c9Ib+ASo7y8D0CLqr5LOD7RqZltR6XAkAZbIhg\n2c7vheLRtckPDBKGCKQnwNj3APJOmTCCKfGW3uRgO/ye0lIu+Ipa6nbxJpx+dWks\nPUtQ+2htCte3Tr+7\n-----END PRIVATE KEY-----\n",
      token_uri: "https://oauth2.googleapis.com/token",
    }),
    useEmulator: false,
  },
} as const;

type FirestoreDocument = {
  fields: Record<string, { stringValue: string }>;
  name: string;
};

type ProjectionDocument = {
  imageUrl: string;
  streamId: string;
  streamUrl: string;
  summary: string;
  title: string;
};

function buildFirestoreCollectionUrl(): string {
  return `${config.streamPersistence.apiBaseUrl}/v1/projects/${config.streamPersistence.projectId}/databases/${config.streamPersistence.databaseId}/documents/${config.streamPersistence.collectionName}`;
}

function buildFirestoreDocumentUrl(streamId: string): string {
  return `${buildFirestoreCollectionUrl()}/${encodeURIComponent(streamId)}`;
}

function buildProjectionUrl(streamId: string): string {
  assert.equal(config.streamProjectionPersistence?.driver, "firebase-rtdb");
  const url = new URL(
    `/mobile/streams/${encodeURIComponent(streamId)}.json`,
    config.streamProjectionPersistence.baseUrl,
  );
  url.searchParams.set("ns", config.streamProjectionPersistence.namespace);
  return url.toString();
}

function createFirestoreFetchMock(
  options: {
    failProjectionDeleteForStreamIds?: Set<string>;
    failProjectionPublishForStreamIds?: Set<string>;
  } = {},
) {
  const documents = new Map<string, FirestoreDocument>();
  const projections = new Map<string, ProjectionDocument>();

  const decodeStreamId = (url: string): string | null => {
    const prefix = `${buildFirestoreCollectionUrl()}/`;
    if (!url.startsWith(prefix)) {
      return null;
    }

    return decodeURIComponent(url.slice(prefix.length));
  };

  const seedDocument = (stream: (typeof seededStreams)[number]): void => {
    documents.set(stream.streamId, {
      fields: {
        createdAt: { stringValue: stream.createdAt },
        imageUrl: { stringValue: stream.imageUrl },
        status: { stringValue: stream.status },
        streamId: { stringValue: stream.streamId },
        streamUrl: { stringValue: stream.streamUrl },
        summary: { stringValue: stream.summary },
        title: { stringValue: stream.title },
        updatedAt: { stringValue: stream.updatedAt },
      },
      name: buildFirestoreDocumentUrl(stream.streamId),
    });
  };

  for (const stream of seededStreams) {
    seedDocument(stream);
    if (stream.status === "active") {
      projections.set(stream.streamId, {
        imageUrl: stream.imageUrl,
        streamId: stream.streamId,
        streamUrl: stream.streamUrl,
        summary: stream.summary,
        title: stream.title,
      });
    }
  }

  return {
    projections,
    fetch: async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string" ? input :
        input instanceof URL ? input.toString() :
        input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");

      if (url === buildFirestoreCollectionUrl() && method === "GET") {
        return Response.json({
          documents: Array.from(documents.values()),
        });
      }

      for (const stream of seededStreams) {
        if (url === buildProjectionUrl(stream.streamId)) {
          if (method === "PUT") {
            if (options.failProjectionPublishForStreamIds?.has(stream.streamId) === true) {
              return new Response(JSON.stringify({ error: "projection write failed" }), {
                status: 500,
              });
            }

            const bodyText =
              typeof init?.body === "string" ? init.body :
              init?.body instanceof Uint8Array ? Buffer.from(init.body).toString("utf8") :
              "";
            projections.set(stream.streamId, JSON.parse(bodyText) as ProjectionDocument);
            return Response.json(projections.get(stream.streamId));
          }

          if (method === "DELETE") {
            if (options.failProjectionDeleteForStreamIds?.has(stream.streamId) === true) {
              return new Response(JSON.stringify({ error: "projection delete failed" }), {
                status: 500,
              });
            }

            projections.delete(stream.streamId);
            return new Response(null, { status: 200 });
          }
        }
      }

      const streamId = decodeStreamId(url);
      if (streamId === null) {
        throw new Error(`Unexpected Firestore test request: ${method} ${url}`);
      }

      if (method === "GET") {
        const document = documents.get(streamId);
        if (document === undefined) {
          return new Response(JSON.stringify({ error: { message: "Not found" } }), {
            status: 404,
          });
        }

        return Response.json(document);
      }

      if (method === "PATCH") {
        const bodyText =
          typeof init?.body === "string" ? init.body :
          init?.body instanceof Uint8Array ? Buffer.from(init.body).toString("utf8") :
          "";
        const payload = JSON.parse(bodyText) as { fields: FirestoreDocument["fields"] };
        const document = {
          fields: payload.fields,
          name: buildFirestoreDocumentUrl(streamId),
        };
        documents.set(streamId, document);
        return Response.json(document);
      }

      if (method === "DELETE") {
        if (!documents.has(streamId)) {
          return new Response(JSON.stringify({ error: { message: "Not found" } }), {
            status: 404,
          });
        }

        documents.delete(streamId);
        return new Response(null, { status: 200 });
      }

      throw new Error(`Unsupported Firestore test method: ${method}`);
    },
  };
}

async function withFirestoreRepository<T>(
  run: (repository: Awaited<ReturnType<typeof createStreamRepository>>) => Promise<T>,
): Promise<T> {
  return withRepositoryUsingFetch(config, createFirestoreFetchMock().fetch, run);
}

async function withRepositoryUsingFetch<T>(
  repositoryConfig: typeof config | typeof cloudConfig,
  fetchImplementation: typeof fetch,
  run: (repository: Awaited<ReturnType<typeof createStreamRepository>>) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;

  try {
    const repository = await createStreamRepository(repositoryConfig);
    return await run(repository);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Test: exchanges a Google service account token before issuing cloud Firestore requests.
// Validates: RDS-AC-013, RDS-AC-014, RDS-AC-025, RDS-AC-026 (Firestore cloud path is authenticated end-to-end)
test("firestore repository authenticates cloud requests with a service account token", async () => {
  const seenAuthorizationHeaders: string[] = [];
  let tokenExchangeCount = 0;

  const fetchMock = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string" ? input :
      input instanceof URL ? input.toString() :
      input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");

    if (url === "https://oauth2.googleapis.com/token" && method === "POST") {
      tokenExchangeCount += 1;
      return Response.json({
        access_token: "cloud-access-token",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }

    if (url === `${cloudConfig.streamPersistence.apiBaseUrl}/v1/projects/${cloudConfig.streamPersistence.projectId}/databases/${cloudConfig.streamPersistence.databaseId}/documents/${cloudConfig.streamPersistence.collectionName}` && method === "GET") {
      const headers = new Headers(init?.headers);
      seenAuthorizationHeaders.push(headers.get("authorization") ?? "");

      return Response.json({
        documents: seededStreams.map((stream) => ({
          fields: {
            createdAt: { stringValue: stream.createdAt },
            imageUrl: { stringValue: stream.imageUrl },
            status: { stringValue: stream.status },
            streamId: { stringValue: stream.streamId },
            streamUrl: { stringValue: stream.streamUrl },
            summary: { stringValue: stream.summary },
            title: { stringValue: stream.title },
            updatedAt: { stringValue: stream.updatedAt },
          },
          name: `${cloudConfig.streamPersistence.apiBaseUrl}/v1/projects/${cloudConfig.streamPersistence.projectId}/databases/${cloudConfig.streamPersistence.databaseId}/documents/${cloudConfig.streamPersistence.collectionName}/${stream.streamId}`,
        })),
      });
    }

    throw new Error(`Unexpected cloud Firestore test request: ${method} ${url}`);
  }) as typeof fetch;

  await withRepositoryUsingFetch(cloudConfig, fetchMock, async (repository) => {
    const response = await resolveRoute("GET", "/api/streams", cloudConfig, repository);
    assert.equal(response.statusCode, 200);
  });

  assert.equal(tokenExchangeCount, 1);
  assert.deepEqual(seenAuthorizationHeaders, [
    "Bearer cloud-access-token",
    "Bearer cloud-access-token",
  ]);
});

// Test: lists the seeded stream catalog with positions and status-based actions.
// Validates: RDS-AC-013, RDS-AC-025, RDS-AC-026 (RDS-REQ-025 - Create draft stream records, RDS-REQ-035 - Delete stream records from the primary data store)
test("stream list route exposes seeded source-of-truth records", async () => {
  await withFirestoreRepository(async (repository) => {
    const response = await resolveRoute("GET", "/api/streams", config, repository);
    const payload = response.payload as {
      items: Array<{
        availableActions: string[];
        createdAt: string;
        position: number;
        status: string;
        streamId: string;
      }>;
    };

    assert.equal(response.statusCode, 200);
    assert.equal(payload.items.length, 5);
    assert.deepEqual(
      payload.items.map((item) => item.streamId),
      [
        "stream-morning-news",
        "stream-night-jazz",
        "stream-weekend-recap",
        "stream-lounge-live",
        "stream-indie-preview",
      ],
    );
    assert.deepEqual(payload.items.map((item) => item.position), [1, 2, 3, 4, 5]);
    assert.match(payload.items[0]?.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(payload.items[0]?.availableActions, ["publish", "unpublish", "edit", "view"]);
    assert.deepEqual(payload.items[2]?.availableActions, ["publish", "edit", "view", "delete"]);
  });
});

// Test: creates a draft stream, then updates it without replacing its identity.
// Validates: RDS-AC-013, RDS-AC-014 (RDS-REQ-025 - Create draft stream records, RDS-REQ-026 - Update stream records without replacing identity)
test("stream create and update flow persists editable changes under one stream identity", async () => {
  await withFirestoreRepository(async (repository) => {
    const createResponse = await resolveRoute("POST", "/api/streams", config, repository, {
      imageUrl: "https://cdn.example.com/streams/late-signals.jpg",
      streamUrl: "https://radio.example.com/late-signals.m3u8",
      summary: "After-hours interviews and listener call-ins.",
      title: "Late Signals",
    });
    const createdPayload = createResponse.payload as { status: string; streamId: string };
    const detailResponse = await resolveRoute(
      "GET",
      `/api/streams/${createdPayload.streamId}`,
      config,
      repository,
    );
    const detailPayload = detailResponse.payload as {
      createdAt: string;
      imageUrl: string;
      status: string;
      streamId: string;
      summary: string;
      title: string;
      updatedAt: string;
    };
    const updateResponse = await resolveRoute(
      "PATCH",
      `/api/streams/${createdPayload.streamId}`,
      config,
      repository,
      {
        imageUrl: "https://cdn.example.com/streams/late-signals-v2.jpg",
        summary: "After-hours interviews, call-ins, and overnight mixes.",
        title: "Late Signals Extended",
      },
    );
    const updatePayload = updateResponse.payload as {
      status: string;
      streamId: string;
      updatedAt: string;
    };
    const updatedDetailResponse = await resolveRoute(
      "GET",
      `/api/streams/${createdPayload.streamId}`,
      config,
      repository,
    );
    const updatedDetailPayload = updatedDetailResponse.payload as {
      imageUrl: string;
      status: string;
      streamId: string;
      summary: string;
      title: string;
      updatedAt: string;
    };

    assert.equal(createResponse.statusCode, 201);
    assert.equal(createdPayload.status, "draft");
    assert.match(createdPayload.streamId, /^stream-late-signals-[a-z0-9]{4}$/);
    assert.equal(detailResponse.statusCode, 200);
    assert.equal(detailPayload.streamId, createdPayload.streamId);
    assert.equal(detailPayload.status, "draft");
    assert.equal(detailPayload.title, "Late Signals");
    assert.equal(detailPayload.summary, "After-hours interviews and listener call-ins.");
    assert.equal(detailPayload.imageUrl, "https://cdn.example.com/streams/late-signals.jpg");
    assert.match(detailPayload.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(detailPayload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal("publishedAt" in detailPayload, false);
    assert.equal("projectionSyncState" in detailPayload, false);
    assert.equal(updateResponse.statusCode, 200);
    assert.equal(updatePayload.streamId, createdPayload.streamId);
    assert.equal(updatePayload.status, "draft");
    assert.match(updatePayload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(updatedDetailResponse.statusCode, 200);
    assert.equal(updatedDetailPayload.streamId, createdPayload.streamId);
    assert.equal(updatedDetailPayload.status, "draft");
    assert.equal(updatedDetailPayload.title, "Late Signals Extended");
    assert.equal(
      updatedDetailPayload.summary,
      "After-hours interviews, call-ins, and overnight mixes.",
    );
    assert.equal(
      updatedDetailPayload.imageUrl,
      "https://cdn.example.com/streams/late-signals-v2.jpg",
    );
    assert.equal(updatedDetailPayload.updatedAt, updatePayload.updatedAt);
  });
});

// Test: rejects invalid create payloads with field-level validation issues.
// Validates: RDS-AC-015 (RDS-REQ-027 - Reject invalid stream mutations)
test("stream create route rejects missing fields and invalid URLs", async () => {
  await withFirestoreRepository(async (repository) => {
    const response = await resolveRoute("POST", "/api/streams", config, repository, {
      imageUrl: "notaurl",
      streamUrl: "still-not-a-url",
      summary: "",
      title: " ",
    });
    const payload = response.payload as {
      error: string;
      issues: Array<{ field: string; message: string }>;
    };

    assert.equal(response.statusCode, 400);
    assert.equal(payload.error, "STREAM_VALIDATION_FAILED");
    assert.deepEqual(
      payload.issues.map((issue) => issue.field),
      ["title", "summary", "streamUrl", "imageUrl"],
    );
  });
});

// Test: updates editable fields while preserving stream identity.
// Validates: RDS-AC-014 (RDS-REQ-026 - Update draft stream records without replacing identity)
test("stream update route preserves stream identity", async () => {
  await withFirestoreRepository(async (repository) => {
    const response = await resolveRoute("PATCH", "/api/streams/stream-night-jazz", config, repository, {
      imageUrl: "https://cdn.example.com/streams/night-jazz-v2.jpg",
      streamId: "stream-night-jazz",
      summary: "Extended late-night jazz programming.",
      title: "Night Jazz Extended",
    });
    const payload = response.payload as {
      status: string;
      streamId: string;
      updatedAt: string;
    };
    const detailResponse = await resolveRoute("GET", "/api/streams/stream-night-jazz", config, repository);
    const detailPayload = detailResponse.payload as {
      imageUrl: string;
      streamId: string;
      summary: string;
      title: string;
    };

    assert.equal(response.statusCode, 200);
    assert.equal(payload.streamId, "stream-night-jazz");
    assert.equal(payload.status, "inactive");
    assert.match(payload.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(detailPayload.streamId, "stream-night-jazz");
    assert.equal(detailPayload.title, "Night Jazz Extended");
    assert.equal(detailPayload.summary, "Extended late-night jazz programming.");
    assert.equal(detailPayload.imageUrl, "https://cdn.example.com/streams/night-jazz-v2.jpg");
  });
});

// Test: rejects attempts to change stream identity on update.
// Validates: RDS-AC-014, RDS-AC-015 (RDS-REQ-026 - Update draft stream records without replacing identity, RDS-REQ-027 - Reject invalid stream mutations)
test("stream update route rejects immutable streamId changes", async () => {
  await withFirestoreRepository(async (repository) => {
    const response = await resolveRoute("PATCH", "/api/streams/stream-night-jazz", config, repository, {
      streamId: "stream-some-other-id",
    });
    const payload = response.payload as {
      error: string;
      issues: Array<{ field: string; message: string }>;
    };

    assert.equal(response.statusCode, 400);
    assert.equal(payload.error, "STREAM_VALIDATION_FAILED");
    assert.deepEqual(payload.issues, [
      {
        field: "streamId",
        message: "streamId is immutable and must match the route parameter.",
      },
    ]);
  });
});

// Test: rejects invalid editable field values on update.
// Validates: RDS-AC-015 (RDS-REQ-027 - Reject invalid stream mutations)
test("stream update route rejects missing required fields and invalid URLs", async () => {
  await withFirestoreRepository(async (repository) => {
    const response = await resolveRoute("PATCH", "/api/streams/stream-night-jazz", config, repository, {
      imageUrl: "notaurl",
      streamUrl: "still-not-a-url",
      summary: "",
      title: " ",
    });
    const payload = response.payload as {
      error: string;
      issues: Array<{ field: string; message: string }>;
    };

    assert.equal(response.statusCode, 400);
    assert.equal(payload.error, "STREAM_VALIDATION_FAILED");
    assert.deepEqual(
      payload.issues.map((issue) => issue.field),
      ["title", "summary", "streamUrl", "imageUrl"],
    );
  });
});

// Test: deletes non-active streams and leaves active streams protected.
// Validates: RDS-AC-025, RDS-AC-026 (RDS-REQ-035 - Delete stream records from the primary data store)
test("stream delete route enforces active-stream protection", async () => {
  await withFirestoreRepository(async (repository) => {
    const deleteInactiveResponse = await resolveRoute(
      "DELETE",
      "/api/streams/stream-night-jazz",
      config,
      repository,
    );
    const deleteInactivePayload = deleteInactiveResponse.payload as {
      deleted: boolean;
      streamId: string;
    };
    const deleteActiveResponse = await resolveRoute(
      "DELETE",
      "/api/streams/stream-morning-news",
      config,
      repository,
    );
    const deleteActivePayload = deleteActiveResponse.payload as {
      error: string;
      message: string;
    };
    const activeStreamAfterDeleteResponse = await resolveRoute(
      "GET",
      "/api/streams/stream-morning-news",
      config,
      repository,
    );
    const activeStreamAfterDeletePayload = activeStreamAfterDeleteResponse.payload as {
      status: string;
      streamId: string;
      title: string;
    };

    assert.equal(deleteInactiveResponse.statusCode, 200);
    assert.deepEqual(deleteInactivePayload, {
      deleted: true,
      streamId: "stream-night-jazz",
    });
    assert.equal(deleteActiveResponse.statusCode, 409);
    assert.deepEqual(deleteActivePayload, {
      error: "ACTIVE_STREAM_DELETE_FORBIDDEN",
      message: "Active streams must be unpublished before deletion.",
    });
    assert.equal(activeStreamAfterDeleteResponse.statusCode, 200);
    assert.equal(activeStreamAfterDeletePayload.streamId, "stream-morning-news");
    assert.equal(activeStreamAfterDeletePayload.status, "active");
    assert.equal(activeStreamAfterDeletePayload.title, "Morning News");
  });
});

// Test: publish, republish, unpublish, and publish-again routes keep Firestore state and mobile projections aligned.
// Validates: RDS-AC-016, RDS-AC-017, RDS-AC-018 (RDS-REQ-028 - Publish draft streams to mobile-facing realtime data, RDS-REQ-029 - Republish active streams to realtime data, RDS-REQ-030 - Unpublish active streams from mobile-facing realtime data)
test("stream lifecycle routes coordinate persistence and RTDB projection changes across the full publish lifecycle", async () => {
  const fetchMock = createFirestoreFetchMock();
  await withRepositoryUsingFetch(config, fetchMock.fetch, async (repository) => {
    const projectionStore = createStreamProjectionStore(config);
    const publishResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-weekend-recap/publish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    const updateActiveWithoutPublishResponse = await resolveRoute(
      "PATCH",
      "/api/streams/stream-morning-news",
      config,
      repository,
      {
        imageUrl: "https://cdn.example.com/streams/morning-news-special.jpg",
        streamUrl: "https://radio.example.com/morning-news-special.m3u8",
        summary: "Extended commuter coverage with market opens and weather alerts.",
        title: "Morning News Special",
      },
    );
    assert.equal(updateActiveWithoutPublishResponse.statusCode, 200);
    assert.deepEqual(fetchMock.projections.get("stream-morning-news"), {
      imageUrl: "https://cdn.example.com/streams/morning-news.jpg",
      streamId: "stream-morning-news",
      streamUrl: "https://radio.example.com/morning-news.m3u8",
      summary: "Fast-moving headlines, weather, and commuter updates.",
      title: "Morning News",
    });
    const republishResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-morning-news/publish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    const publishedDraftDetailResponse = await resolveRoute(
      "GET",
      "/api/streams/stream-weekend-recap",
      config,
      repository,
    );
    const reactivatedDetailResponse = await resolveRoute(
      "GET",
      "/api/streams/stream-morning-news",
      config,
      repository,
    );

    assert.equal(publishResponse.statusCode, 200);
    assert.deepEqual(publishResponse.payload, {
      projectionTarget: "/mobile/streams/stream-weekend-recap",
      status: "active",
      streamId: "stream-weekend-recap",
    });
    assert.equal(republishResponse.statusCode, 200);
    assert.deepEqual(republishResponse.payload, {
      projectionTarget: "/mobile/streams/stream-morning-news",
      status: "active",
      streamId: "stream-morning-news",
    });
    assert.deepEqual(fetchMock.projections.get("stream-weekend-recap"), {
      imageUrl: "https://cdn.example.com/streams/weekend-recap.jpg",
      streamId: "stream-weekend-recap",
      streamUrl: "https://radio.example.com/weekend-recap.m3u8",
      summary: "Highlights and interviews from the last seven days.",
      title: "Weekend Recap",
    });
    assert.deepEqual(fetchMock.projections.get("stream-morning-news"), {
      imageUrl: "https://cdn.example.com/streams/morning-news-special.jpg",
      streamId: "stream-morning-news",
      streamUrl: "https://radio.example.com/morning-news-special.m3u8",
      summary: "Extended commuter coverage with market opens and weather alerts.",
      title: "Morning News Special",
    });
    const unpublishResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-morning-news/unpublish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    assert.equal(unpublishResponse.statusCode, 200);
    assert.deepEqual(unpublishResponse.payload, {
      projectionRemoved: true,
      status: "inactive",
      streamId: "stream-morning-news",
    });
    assert.equal(fetchMock.projections.has("stream-morning-news"), false);
    const republishAfterInactiveResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-morning-news/publish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    assert.equal(republishAfterInactiveResponse.statusCode, 200);
    assert.deepEqual(republishAfterInactiveResponse.payload, {
      projectionTarget: "/mobile/streams/stream-morning-news",
      status: "active",
      streamId: "stream-morning-news",
    });
    assert.equal(publishedDraftDetailResponse.statusCode, 200);
    assert.equal(
      (publishedDraftDetailResponse.payload as { status: string }).status,
      "active",
    );
    assert.equal(reactivatedDetailResponse.statusCode, 200);
    assert.equal(
      (reactivatedDetailResponse.payload as { status: string }).status,
      "active",
    );
    assert.deepEqual(fetchMock.projections.get("stream-morning-news"), {
      imageUrl: "https://cdn.example.com/streams/morning-news-special.jpg",
      streamId: "stream-morning-news",
      streamUrl: "https://radio.example.com/morning-news-special.m3u8",
      summary: "Extended commuter coverage with market opens and weather alerts.",
      title: "Morning News Special",
    });
  });
});

// Test: publish and publish-again routes reject lifecycle state changes when RTDB sync cannot complete.
// Validates: RDS-AC-028 (RDS-REQ-037 - Reject publish or unpublish when realtime sync cannot complete)
test("stream lifecycle routes reject projection-sync failures without leaving a partially published stream behind", async () => {
  const fetchMock = createFirestoreFetchMock({
    failProjectionDeleteForStreamIds: new Set(["stream-morning-news"]),
    failProjectionPublishForStreamIds: new Set(["stream-night-jazz", "stream-lounge-live"]),
  });
  await withRepositoryUsingFetch(config, fetchMock.fetch, async (repository) => {
    const projectionStore = createStreamProjectionStore(config);
    const publishResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-night-jazz/publish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    const unpublishResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-morning-news/unpublish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    const successfulUnpublishResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-lounge-live/unpublish",
      config,
      repository,
      undefined,
      createStreamProjectionStore(config),
    );
    const failedPublishAgainResponse = await resolveRoute(
      "POST",
      "/api/streams/stream-lounge-live/publish",
      config,
      repository,
      undefined,
      projectionStore,
    );
    const inactiveDetailResponse = await resolveRoute(
      "GET",
      "/api/streams/stream-night-jazz",
      config,
      repository,
    );
    const activeDetailResponse = await resolveRoute(
      "GET",
      "/api/streams/stream-lounge-live",
      config,
      repository,
    );
    const inactiveAfterSuccessfulUnpublishResponse = await resolveRoute(
      "GET",
      "/api/streams/stream-lounge-live",
      config,
      repository,
    );

    assert.equal(publishResponse.statusCode, 503);
    assert.deepEqual(publishResponse.payload, {
      action: "publish",
      error: "STREAM_REALTIME_SYNC_UNAVAILABLE",
      message:
        "Publish requires realtime projection mutation support before the lifecycle contract can succeed.",
      projectionTarget: "/mobile/streams/stream-night-jazz",
    });
    assert.equal(unpublishResponse.statusCode, 503);
    assert.deepEqual(unpublishResponse.payload, {
      action: "unpublish",
      error: "STREAM_REALTIME_SYNC_UNAVAILABLE",
      message:
        "Unpublish requires realtime projection mutation support before the lifecycle contract can succeed.",
      projectionTarget: "/mobile/streams/stream-morning-news",
    });
    assert.equal(successfulUnpublishResponse.statusCode, 200);
    assert.equal(failedPublishAgainResponse.statusCode, 503);
    assert.deepEqual(failedPublishAgainResponse.payload, {
      action: "publish",
      error: "STREAM_REALTIME_SYNC_UNAVAILABLE",
      message:
        "Publish requires realtime projection mutation support before the lifecycle contract can succeed.",
      projectionTarget: "/mobile/streams/stream-lounge-live",
    });
    assert.equal(
      (inactiveDetailResponse.payload as { status: string }).status,
      "inactive",
    );
    assert.equal(
      (activeDetailResponse.payload as { status: string }).status,
      "inactive",
    );
    assert.equal(
      (inactiveAfterSuccessfulUnpublishResponse.payload as { status: string }).status,
      "inactive",
    );
    assert.equal(fetchMock.projections.has("stream-night-jazz"), false);
    assert.equal(fetchMock.projections.has("stream-morning-news"), true);
    assert.equal(fetchMock.projections.has("stream-lounge-live"), false);
  });
});

// Test: rejects the outdated contract fields that would bypass backend-owned stream semantics.
// Validates: RDS-AC-013, RDS-AC-014, RDS-AC-015 (RDS-REQ-025 - Create draft stream records, RDS-REQ-026 - Update stream records without replacing identity, RDS-REQ-027 - Reject invalid stream mutations)
test("stream CRUD contract rejects operator-controlled status fields", async () => {
  await withFirestoreRepository(async (repository) => {
    const createResponse = await resolveRoute("POST", "/api/streams", config, repository, {
      imageUrl: "https://cdn.example.com/streams/late-signals.jpg",
      status: "active",
      streamUrl: "https://radio.example.com/late-signals.m3u8",
      summary: "After-hours interviews and listener call-ins.",
      title: "Late Signals",
    });
    const updateResponse = await resolveRoute("PATCH", "/api/streams/stream-night-jazz", config, repository, {
      status: "active",
    });

    assert.equal(createResponse.statusCode, 400);
    assert.equal(updateResponse.statusCode, 400);
    assert.deepEqual((createResponse.payload as { issues: Array<{ field: string }> }).issues, [
      { field: "status", message: "status is owned by the backend and must not be provided on create." },
    ]);
    assert.deepEqual((updateResponse.payload as { issues: Array<{ field: string }> }).issues, [
      { field: "status", message: "status is controlled by publish and unpublish actions." },
    ]);
  });
});
