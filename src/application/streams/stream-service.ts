import { toStreamListItemDto } from "../../domain/stream/stream.ts";
import type {
  CreateStreamInput,
  StreamDetailDto,
  StreamListItemDto,
  UpdateStreamInput,
} from "../../domain/stream/stream.ts";
import type { StreamRepository } from "../../infrastructure/persistence/in-memory-stream-repository.ts";

export function listStreams(
  repository: StreamRepository,
): { items: StreamListItemDto[] } {
  return {
    items: repository.list().map((stream, index) => toStreamListItemDto(stream, index + 1)),
  };
}

export function createStream(
  repository: StreamRepository,
  input: CreateStreamInput,
): { status: string; streamId: string } {
  const createdStream = repository.create(input);
  return {
    status: createdStream.status,
    streamId: createdStream.streamId,
  };
}

export function getStream(
  repository: StreamRepository,
  streamId: string,
): StreamDetailDto {
  return repository.getById(streamId);
}

export function updateStream(
  repository: StreamRepository,
  streamId: string,
  input: UpdateStreamInput,
): { status: string; streamId: string; updatedAt: string } {
  const updatedStream = repository.update(streamId, input);
  return {
    status: updatedStream.status,
    streamId: updatedStream.streamId,
    updatedAt: updatedStream.updatedAt,
  };
}

export function deleteStream(
  repository: StreamRepository,
  streamId: string,
): { deleted: true; streamId: string } {
  return repository.delete(streamId);
}
