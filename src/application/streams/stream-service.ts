import {
  applyStreamUpdate,
  assertStreamCanBeUnpublished,
  assertStreamCanBeDeleted,
  buildMobileStreamProjectionContract,
  buildProjectionTarget,
  buildPublishStreamResponse,
  buildDraftStream,
  buildUnpublishStreamResponse,
  toStreamListItemDto,
} from "../../domain/stream/stream.ts";
import type {
  CreateStreamInput,
  MobileStreamProjectionContract,
  PublishStreamResponseDto,
  StreamDetailDto,
  StreamListItemDto,
  UnpublishStreamResponseDto,
  UpdateStreamInput,
} from "../../domain/stream/stream.ts";
import type { StreamRepository } from "../../infrastructure/persistence/stream-repository.ts";
import type { StreamProjectionStore } from "../../infrastructure/persistence/stream-projection-store.ts";
import {
  createStreamRealtimeSyncUnavailableError,
} from "../../shared/errors/stream-errors.ts";

export async function listStreams(
  repository: StreamRepository,
): Promise<{ items: StreamListItemDto[] }> {
  const streams = (await repository.list())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    items: streams.map((stream, index) => toStreamListItemDto(stream, index + 1)),
  };
}

export async function createStream(
  repository: StreamRepository,
  input: CreateStreamInput,
): Promise<{ status: string; streamId: string }> {
  const existingIds = new Set((await repository.list()).map((stream) => stream.streamId));
  const createdStream = buildDraftStream(input, existingIds);
  await repository.create(createdStream);
  return {
    status: createdStream.status,
    streamId: createdStream.streamId,
  };
}

export async function getStream(
  repository: StreamRepository,
  streamId: string,
): Promise<StreamDetailDto> {
  return repository.getById(streamId);
}

export function getMobileStreamProjectionContract(): MobileStreamProjectionContract {
  return buildMobileStreamProjectionContract();
}

export async function updateStream(
  repository: StreamRepository,
  streamId: string,
  input: UpdateStreamInput,
): Promise<{ status: string; streamId: string; updatedAt: string }> {
  const existingStream = await repository.getById(streamId);
  const updatedStream = applyStreamUpdate(existingStream, streamId, input);
  await repository.update(updatedStream);
  return {
    status: updatedStream.status,
    streamId: updatedStream.streamId,
    updatedAt: updatedStream.updatedAt,
  };
}

export async function deleteStream(
  repository: StreamRepository,
  streamId: string,
): Promise<{ deleted: true; streamId: string }> {
  const existingStream = await repository.getById(streamId);
  assertStreamCanBeDeleted(existingStream);
  return repository.delete(streamId);
}

export async function publishStream(
  repository: StreamRepository,
  projectionStore: StreamProjectionStore,
  streamId: string,
): Promise<PublishStreamResponseDto> {
  const existingStream = await repository.getById(streamId);
  const publishedStream = {
    ...existingStream,
    status: "active" as const,
    updatedAt: new Date().toISOString(),
  };

  try {
    await projectionStore.publish(publishedStream);
  } catch (error) {
    logRealtimeSyncFailure("publish", streamId, error);
    throw createStreamRealtimeSyncUnavailableError(
      "publish",
      buildProjectionTarget(streamId),
    );
  }

  try {
    await repository.update(publishedStream);
  } catch (error) {
    await rollbackProjectionMutation(projectionStore, existingStream);
    throw error;
  }

  return buildPublishStreamResponse(publishedStream);
}

export async function unpublishStream(
  repository: StreamRepository,
  projectionStore: StreamProjectionStore,
  streamId: string,
): Promise<UnpublishStreamResponseDto> {
  const existingStream = await repository.getById(streamId);
  assertStreamCanBeUnpublished(existingStream);

  try {
    await projectionStore.unpublish(streamId);
  } catch (error) {
    logRealtimeSyncFailure("unpublish", streamId, error);
    throw createStreamRealtimeSyncUnavailableError(
      "unpublish",
      buildProjectionTarget(streamId),
    );
  }

  try {
    await repository.update({
      ...existingStream,
      status: "inactive",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await rollbackProjectionMutation(projectionStore, existingStream);
    throw error;
  }

  return buildUnpublishStreamResponse(streamId);
}

async function rollbackProjectionMutation(
  projectionStore: StreamProjectionStore,
  existingStream: Awaited<ReturnType<StreamRepository["getById"]>>,
): Promise<void> {
  try {
    if (existingStream.status === "active") {
      await projectionStore.publish(existingStream);
      return;
    }

    await projectionStore.unpublish(existingStream.streamId);
  } catch {
    // Keep the original persistence failure as the surfaced error.
  }
}

function logRealtimeSyncFailure(
  action: "publish" | "unpublish",
  streamId: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `[bof-be] realtime projection ${action} failed for ${streamId}: ${message}`,
  );
}
