import {
  buildMobileStreamProjection,
  type MobileStreamProjectionDto,
  type StreamRecord,
} from "../../domain/stream/stream.ts";

export interface StreamProjectionStore {
  publish(stream: StreamRecord): Promise<void>;
  unpublish(streamId: string): Promise<void>;
}

export function createSeededStreamProjectionStore(
  seed: StreamRecord[],
): StreamProjectionStore {
  return new InMemoryStreamProjectionStore(seed);
}

class InMemoryStreamProjectionStore implements StreamProjectionStore {
  readonly projections = new Map<string, MobileStreamProjectionDto>();

  constructor(seed: StreamRecord[]) {
    for (const stream of seed) {
      if (stream.status === "active") {
        this.projections.set(stream.streamId, buildMobileStreamProjection(stream));
      }
    }
  }

  async publish(stream: StreamRecord): Promise<void> {
    this.projections.set(stream.streamId, buildMobileStreamProjection(stream));
  }

  async unpublish(streamId: string): Promise<void> {
    this.projections.delete(streamId);
  }
}
