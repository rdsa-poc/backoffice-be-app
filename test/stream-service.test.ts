import assert from "node:assert/strict";
import test from "node:test";

import {
  publishStream,
  createStream,
  deleteStream,
  unpublishStream,
  updateStream,
} from "../src/application/streams/stream-service.ts";
import {
  buildMobileStreamProjection,
  buildMobileStreamProjectionContract,
  buildPublishStreamResponse,
  buildUnpublishStreamResponse,
  type StreamRecord,
} from "../src/domain/stream/stream.ts";
import type { StreamProjectionStore } from "../src/infrastructure/persistence/stream-projection-store.ts";
import type { StreamRepository } from "../src/infrastructure/persistence/stream-repository.ts";

function buildStreamRecord(overrides: Partial<StreamRecord> = {}): StreamRecord {
  return {
    createdAt: "2026-05-20T11:00:00.000Z",
    imageUrl: "https://cdn.example.com/streams/night-jazz.jpg",
    status: "inactive",
    streamId: "stream-night-jazz",
    streamUrl: "https://radio.example.com/night-jazz.m3u8",
    summary: "Late-night jazz programming with host-led transitions.",
    title: "Night Jazz",
    updatedAt: "2026-05-20T11:05:00.000Z",
    ...overrides,
  };
}

// Test: createStream generates a backend-owned draft record before persistence.
// Validates: RDS-AC-013 (RDS-REQ-025 - Create draft stream records)
test("stream service builds a draft record with generated immutable identity", async () => {
  const persistedRecords: StreamRecord[] = [];
  const repository: StreamRepository = {
    async create(record) {
      persistedRecords.push(record);
      return structuredClone(record);
    },
    async delete() {
      throw new Error("delete should not be called");
    },
    async getById() {
      throw new Error("getById should not be called");
    },
    async list() {
      return [
        buildStreamRecord({ streamId: "stream-late-signals-abcd" }),
      ];
    },
    async update() {
      throw new Error("update should not be called");
    },
  };

  const result = await createStream(repository, {
    imageUrl: " https://cdn.example.com/streams/late-signals.jpg ",
    streamUrl: " https://radio.example.com/late-signals.m3u8 ",
    summary: " After-hours interviews and listener call-ins. ",
    title: " Late Signals ",
  });

  assert.equal(result.status, "draft");
  assert.match(result.streamId, /^stream-late-signals-[a-z0-9]{4}$/);
  assert.notEqual(result.streamId, "stream-late-signals-abcd");
  assert.equal(persistedRecords.length, 1);
  assert.deepEqual(persistedRecords[0], {
    createdAt: persistedRecords[0]?.createdAt,
    imageUrl: "https://cdn.example.com/streams/late-signals.jpg",
    status: "draft",
    streamId: result.streamId,
    streamUrl: "https://radio.example.com/late-signals.m3u8",
    summary: "After-hours interviews and listener call-ins.",
    title: "Late Signals",
    updatedAt: persistedRecords[0]?.updatedAt,
  });
  assert.match(persistedRecords[0]?.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(persistedRecords[0]?.createdAt, persistedRecords[0]?.updatedAt);
});

// Test: updateStream preserves stream identity and non-editable fields while persisting only editable changes.
// Validates: RDS-AC-014, RDS-AC-027 (RDS-REQ-026 - Update stream records without replacing identity, RDS-REQ-036 - Keep edit persistence separate from realtime publish actions)
test("stream service preserves immutable identity when updating editable fields", async () => {
  const existingStream = buildStreamRecord({
    status: "active",
    updatedAt: "2026-05-20T11:30:00.000Z",
  });
  let persistedRecord: StreamRecord | undefined;
  const repository: StreamRepository = {
    async create() {
      throw new Error("create should not be called");
    },
    async delete() {
      throw new Error("delete should not be called");
    },
    async getById(streamId) {
      assert.equal(streamId, existingStream.streamId);
      return structuredClone(existingStream);
    },
    async list() {
      throw new Error("list should not be called");
    },
    async update(record) {
      persistedRecord = structuredClone(record);
      return structuredClone(record);
    },
  };

  const result = await updateStream(repository, existingStream.streamId, {
    imageUrl: " https://cdn.example.com/streams/night-jazz-v2.jpg ",
    streamId: existingStream.streamId,
    summary: " Extended late-night jazz programming. ",
    title: " Night Jazz Extended ",
  });

  assert.equal(result.streamId, existingStream.streamId);
  assert.equal(result.status, "active");
  assert.notEqual(result.updatedAt, existingStream.updatedAt);
  assert.deepEqual(persistedRecord, {
    ...existingStream,
    imageUrl: "https://cdn.example.com/streams/night-jazz-v2.jpg",
    summary: "Extended late-night jazz programming.",
    title: "Night Jazz Extended",
    updatedAt: result.updatedAt,
  });
});

// Test: deleteStream rejects active records before persistence deletion is attempted.
// Validates: RDS-AC-026 (RDS-REQ-035 - Delete stream records from the primary data store)
test("stream service blocks active stream deletion before repository delete", async () => {
  let deleteCalled = false;
  const activeStream = buildStreamRecord({ status: "active", streamId: "stream-morning-news" });
  const repository: StreamRepository = {
    async create() {
      throw new Error("create should not be called");
    },
    async delete() {
      deleteCalled = true;
      return { deleted: true, streamId: activeStream.streamId };
    },
    async getById(streamId) {
      assert.equal(streamId, activeStream.streamId);
      return structuredClone(activeStream);
    },
    async list() {
      throw new Error("list should not be called");
    },
    async update() {
      throw new Error("update should not be called");
    },
  };

  await assert.rejects(
    () => deleteStream(repository, activeStream.streamId),
    {
      code: "ACTIVE_STREAM_DELETE_FORBIDDEN",
      message: "Active streams must be unpublished before deletion.",
      name: "StreamConflictError",
      statusCode: 409,
    },
  );
  assert.equal(deleteCalled, false);
});

// Test: lifecycle contract helpers expose the mobile projection schema and deterministic removal semantics.
// Validates: RDS-AC-019, RDS-AC-020, RDS-AC-021, RDS-AC-064 (RDS-REQ-031 - Load published stream discovery data in mobile, RDS-REQ-032 - Open published stream detail screens in mobile, RDS-REQ-033 - Show explicit loading, empty, and error states for stream discovery)
test("stream lifecycle contract helpers derive projection and response DTOs", () => {
  const stream = buildStreamRecord({
    status: "active",
    streamId: "stream-late-signals",
  });
  const contract = buildMobileStreamProjectionContract();

  assert.deepEqual(buildMobileStreamProjection(stream), {
    imageUrl: stream.imageUrl,
    streamId: stream.streamId,
    streamUrl: stream.streamUrl,
    summary: stream.summary,
    title: stream.title,
  });
  assert.deepEqual(contract, {
    detailPathPattern: "/mobile/streams/{streamId}",
    discoveryCollectionPath: "/mobile/streams",
    fields: {
      imageUrl: "string",
      streamId: "string",
      streamUrl: "string",
      summary: "string",
      title: "string",
    },
    removalSemantics: {
      detailSelectionMissingProjection:
        "show-stream-removed-error-and-return-to-discovery",
      missingProjectionRecord: "treat-as-removed-from-mobile-discovery",
      sourceOfTruthStatusesWithoutProjection: ["draft", "inactive"],
    },
    views: {
      detail: ["imageUrl", "title", "summary", "streamUrl"],
      discoveryList: ["imageUrl", "title", "summary"],
    },
  });
  assert.deepEqual(buildPublishStreamResponse(stream), {
    projectionTarget: "/mobile/streams/stream-late-signals",
    status: "active",
    streamId: "stream-late-signals",
  });
  assert.deepEqual(buildUnpublishStreamResponse(stream.streamId), {
    projectionRemoved: true,
    status: "inactive",
    streamId: "stream-late-signals",
  });
});

// Test: publish, republish, publish-again, and unpublish coordinate source-of-truth status changes with projection mutations.
// Validates: RDS-AC-016, RDS-AC-017, RDS-AC-018 (RDS-REQ-028 - Publish draft streams to mobile-facing realtime data, RDS-REQ-029 - Republish active streams to realtime data, RDS-REQ-030 - Unpublish active streams from mobile-facing realtime data)
test("stream service lifecycle actions persist source-of-truth and projection changes together", async () => {
  const activeStream = buildStreamRecord({
    status: "active",
    streamId: "stream-morning-news",
  });
  const draftStream = buildStreamRecord({
    status: "draft",
    streamId: "stream-weekend-recap",
  });
  const inactiveStream = buildStreamRecord({
    status: "inactive",
    streamId: "stream-night-jazz",
  });
  const projectionState = new Map<string, ReturnType<typeof buildMobileStreamProjection>>();
  projectionState.set(activeStream.streamId, buildMobileStreamProjection(activeStream));
  let currentDraftStream = structuredClone(draftStream);
  let currentInactiveStream = structuredClone(inactiveStream);
  let currentActiveStream = structuredClone(activeStream);
  const repository: StreamRepository = {
    async create() {
      throw new Error("create should not be called");
    },
    async delete() {
      throw new Error("delete should not be called");
    },
    async getById(streamId) {
      if (streamId === activeStream.streamId) {
        return structuredClone(currentActiveStream);
      }

      if (streamId === inactiveStream.streamId) {
        return structuredClone(currentInactiveStream);
      }

      return structuredClone(currentDraftStream);
    },
    async list() {
      throw new Error("list should not be called");
    },
    async update(record) {
      if (record.streamId === currentDraftStream.streamId) {
        currentDraftStream = structuredClone(record);
      } else if (record.streamId === currentActiveStream.streamId) {
        currentActiveStream = structuredClone(record);
      } else {
        currentInactiveStream = structuredClone(record);
      }

      return structuredClone(record);
    },
  };
  const projectionStore: StreamProjectionStore = {
    async publish(stream) {
      projectionState.set(stream.streamId, buildMobileStreamProjection(stream));
    },
    async unpublish(streamId) {
      projectionState.delete(streamId);
    },
  };

  const publishDraftResult = await publishStream(repository, projectionStore, draftStream.streamId);
  const publishResult = await publishStream(repository, projectionStore, inactiveStream.streamId);
  const republishResult = await publishStream(repository, projectionStore, activeStream.streamId);
  const unpublishResult = await unpublishStream(repository, projectionStore, activeStream.streamId);

  assert.deepEqual(publishDraftResult, buildPublishStreamResponse(draftStream));
  assert.deepEqual(publishResult, buildPublishStreamResponse(inactiveStream));
  assert.deepEqual(republishResult, buildPublishStreamResponse(activeStream));
  assert.deepEqual(unpublishResult, buildUnpublishStreamResponse(activeStream.streamId));
  assert.equal(currentDraftStream.status, "active");
  assert.equal(currentInactiveStream.status, "active");
  assert.equal(currentActiveStream.status, "inactive");
  assert.deepEqual(
    projectionState.get(draftStream.streamId),
    buildMobileStreamProjection(currentDraftStream),
  );
  assert.deepEqual(
    projectionState.get(inactiveStream.streamId),
    buildMobileStreamProjection(currentInactiveStream),
  );
  assert.equal(projectionState.has(activeStream.streamId), false);
});

// Test: lifecycle actions reject source-of-truth changes when the realtime projection mutation fails.
// Validates: RDS-AC-028 (RDS-REQ-037 - Reject publish or unpublish when realtime sync cannot complete)
test("stream service lifecycle actions fail explicitly when realtime projection sync is unavailable", async () => {
  const activeStream = buildStreamRecord({
    status: "active",
    streamId: "stream-morning-news",
  });
  const inactiveStream = buildStreamRecord({
    status: "inactive",
    streamId: "stream-night-jazz",
  });
  let updateCallCount = 0;
  const repository: StreamRepository = {
    async create() {
      throw new Error("create should not be called");
    },
    async delete() {
      throw new Error("delete should not be called");
    },
    async getById(streamId) {
      return streamId === activeStream.streamId
        ? structuredClone(activeStream)
        : structuredClone(inactiveStream);
    },
    async list() {
      throw new Error("list should not be called");
    },
    async update() {
      updateCallCount += 1;
      throw new Error("update should not be called when projection sync fails");
    },
  };
  const projectionStore: StreamProjectionStore = {
    async publish() {
      throw new Error("rtdb down");
    },
    async unpublish() {
      throw new Error("rtdb down");
    },
  };

  await assert.rejects(
    () => publishStream(repository, projectionStore, inactiveStream.streamId),
    {
      action: "publish",
      code: "STREAM_REALTIME_SYNC_UNAVAILABLE",
      message:
        "Publish requires realtime projection mutation support before the lifecycle contract can succeed.",
      projectionTarget: "/mobile/streams/stream-night-jazz",
      statusCode: 503,
    },
  );
  await assert.rejects(
    () => unpublishStream(repository, projectionStore, activeStream.streamId),
    {
      action: "unpublish",
      code: "STREAM_REALTIME_SYNC_UNAVAILABLE",
      message:
        "Unpublish requires realtime projection mutation support before the lifecycle contract can succeed.",
      projectionTarget: "/mobile/streams/stream-morning-news",
      statusCode: 503,
    },
  );
  assert.equal(updateCallCount, 0);
});

// Test: publish rolls back the projection mutation if source-of-truth persistence fails after the RTDB write.
// Validates: RDS-AC-028 (RDS-REQ-037 - Reject publish or unpublish when realtime sync cannot complete)
test("stream service publish rolls back the projection when source-of-truth persistence fails", async () => {
  const inactiveStream = buildStreamRecord({
    status: "inactive",
    streamId: "stream-night-jazz",
  });
  const projectionState = new Map<string, ReturnType<typeof buildMobileStreamProjection>>();
  const repository: StreamRepository = {
    async create() {
      throw new Error("create should not be called");
    },
    async delete() {
      throw new Error("delete should not be called");
    },
    async getById(streamId) {
      assert.equal(streamId, inactiveStream.streamId);
      return structuredClone(inactiveStream);
    },
    async list() {
      throw new Error("list should not be called");
    },
    async update() {
      throw new Error("firestore unavailable");
    },
  };
  const projectionStore: StreamProjectionStore = {
    async publish(stream) {
      projectionState.set(stream.streamId, buildMobileStreamProjection(stream));
    },
    async unpublish(streamId) {
      projectionState.delete(streamId);
    },
  };

  await assert.rejects(
    () => publishStream(repository, projectionStore, inactiveStream.streamId),
    /firestore unavailable/,
  );
  assert.equal(projectionState.has(inactiveStream.streamId), false);
});

// Test: unpublish restores the prior active projection if source-of-truth persistence fails after the RTDB delete.
// Validates: RDS-AC-028 (RDS-REQ-037 - Reject publish or unpublish when realtime sync cannot complete)
test("stream service unpublish restores the projection when source-of-truth persistence fails", async () => {
  const activeStream = buildStreamRecord({
    status: "active",
    streamId: "stream-morning-news",
  });
  const projectionState = new Map<string, ReturnType<typeof buildMobileStreamProjection>>();
  projectionState.set(activeStream.streamId, buildMobileStreamProjection(activeStream));
  const repository: StreamRepository = {
    async create() {
      throw new Error("create should not be called");
    },
    async delete() {
      throw new Error("delete should not be called");
    },
    async getById(streamId) {
      assert.equal(streamId, activeStream.streamId);
      return structuredClone(activeStream);
    },
    async list() {
      throw new Error("list should not be called");
    },
    async update() {
      throw new Error("firestore unavailable");
    },
  };
  const projectionStore: StreamProjectionStore = {
    async publish(stream) {
      projectionState.set(stream.streamId, buildMobileStreamProjection(stream));
    },
    async unpublish(streamId) {
      projectionState.delete(streamId);
    },
  };

  await assert.rejects(
    () => unpublishStream(repository, projectionStore, activeStream.streamId),
    /firestore unavailable/,
  );
  assert.deepEqual(
    projectionState.get(activeStream.streamId),
    buildMobileStreamProjection(activeStream),
  );
});
