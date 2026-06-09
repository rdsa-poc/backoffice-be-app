import assert from "node:assert/strict";
import test from "node:test";

import { resolveRoute } from "../src/api/routes.ts";
import { createSeededStreamRepository } from "../src/infrastructure/persistence/in-memory-stream-repository.ts";

const config = {
  appId: "bof-be",
  environmentName: "local",
  port: 8080,
  realtimeBaseUrl: "http://localhost:5001",
} as const;

// Test: lists the seeded stream catalog with positions and status-based actions.
// Validates: RDS-AC-013, RDS-AC-025, RDS-AC-026 (RDS-REQ-025 - Create draft stream records, RDS-REQ-035 - Delete stream records from the primary data store)
test("stream list route exposes seeded source-of-truth records", () => {
  const repository = createSeededStreamRepository();
  const response = resolveRoute("GET", "/api/streams", config, repository);
  const payload = response.payload as {
    items: Array<{
      availableActions: string[];
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
  assert.deepEqual(payload.items[0]?.availableActions, ["deactivate", "edit", "view"]);
  assert.deepEqual(payload.items[2]?.availableActions, ["publish", "edit", "view", "delete"]);
});

// Test: creates a draft stream with generated identity and persists it in the source-of-truth store.
// Validates: RDS-AC-013 (RDS-REQ-025 - Create draft stream records)
test("stream create route persists a draft record", () => {
  const repository = createSeededStreamRepository();
  const createResponse = resolveRoute("POST", "/api/streams", config, repository, {
    imageUrl: "https://cdn.example.com/streams/late-signals.jpg",
    streamUrl: "https://radio.example.com/late-signals.m3u8",
    summary: "After-hours interviews and listener call-ins.",
    title: "Late Signals",
  });
  const createdPayload = createResponse.payload as { status: string; streamId: string };
  const detailResponse = resolveRoute(
    "GET",
    `/api/streams/${createdPayload.streamId}`,
    config,
    repository,
  );
  const detailPayload = detailResponse.payload as {
    status: string;
    streamId: string;
    title: string;
  };

  assert.equal(createResponse.statusCode, 201);
  assert.equal(createdPayload.status, "draft");
  assert.equal(createdPayload.streamId, "stream-late-signals");
  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailPayload.streamId, "stream-late-signals");
  assert.equal(detailPayload.status, "draft");
  assert.equal(detailPayload.title, "Late Signals");
});

// Test: rejects invalid create payloads with field-level validation issues.
// Validates: RDS-AC-015 (RDS-REQ-027 - Reject invalid stream mutations)
test("stream create route rejects missing fields and invalid URLs", () => {
  const repository = createSeededStreamRepository();
  const response = resolveRoute("POST", "/api/streams", config, repository, {
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

// Test: updates editable fields while preserving stream identity.
// Validates: RDS-AC-014 (RDS-REQ-026 - Update draft stream records without replacing identity)
test("stream update route preserves stream identity", () => {
  const repository = createSeededStreamRepository();
  const response = resolveRoute("PATCH", "/api/streams/stream-night-jazz", config, repository, {
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
  const detailResponse = resolveRoute("GET", "/api/streams/stream-night-jazz", config, repository);
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

// Test: rejects attempts to change stream identity on update.
// Validates: RDS-AC-014, RDS-AC-015 (RDS-REQ-026 - Update draft stream records without replacing identity, RDS-REQ-027 - Reject invalid stream mutations)
test("stream update route rejects immutable streamId changes", () => {
  const repository = createSeededStreamRepository();
  const response = resolveRoute("PATCH", "/api/streams/stream-night-jazz", config, repository, {
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

// Test: deletes non-active streams and leaves active streams protected.
// Validates: RDS-AC-025, RDS-AC-026 (RDS-REQ-035 - Delete stream records from the primary data store)
test("stream delete route enforces active-stream protection", () => {
  const repository = createSeededStreamRepository();

  const deleteInactiveResponse = resolveRoute(
    "DELETE",
    "/api/streams/stream-night-jazz",
    config,
    repository,
  );
  const deleteInactivePayload = deleteInactiveResponse.payload as {
    deleted: boolean;
    streamId: string;
  };
  const deleteActiveResponse = resolveRoute(
    "DELETE",
    "/api/streams/stream-morning-news",
    config,
    repository,
  );
  const deleteActivePayload = deleteActiveResponse.payload as {
    error: string;
    message: string;
  };

  assert.equal(deleteInactiveResponse.statusCode, 200);
  assert.deepEqual(deleteInactivePayload, {
    deleted: true,
    streamId: "stream-night-jazz",
  });
  assert.equal(deleteActiveResponse.statusCode, 409);
  assert.deepEqual(deleteActivePayload, {
    error: "ACTIVE_STREAM_DELETE_FORBIDDEN",
    message: "Active streams must be deactivated before deletion.",
  });
});
