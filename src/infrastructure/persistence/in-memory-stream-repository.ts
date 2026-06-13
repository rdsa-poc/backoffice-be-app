import {
  type StreamRecord,
} from "../../domain/stream/stream.ts";
import { StreamNotFoundError } from "../../shared/errors/stream-errors.ts";
import { seededStreams, type StreamRepository } from "./stream-repository.ts";

export function createSeededStreamRepository(): StreamRepository {
  return new InMemoryStreamRepository(seededStreams);
}

class InMemoryStreamRepository implements StreamRepository {
  readonly streams = new Map<string, StreamRecord>();

  constructor(seed: StreamRecord[]) {
    for (const stream of seed) {
      this.streams.set(stream.streamId, cloneStream(stream));
    }
  }

  async list(): Promise<StreamRecord[]> {
    return Array.from(this.streams.values()).map(cloneStream);
  }

  async getById(streamId: string): Promise<StreamRecord> {
    const stream = this.streams.get(streamId);
    if (stream === undefined) {
      throw new StreamNotFoundError(streamId);
    }

    return cloneStream(stream);
  }

  async create(record: StreamRecord): Promise<StreamRecord> {
    this.streams.set(record.streamId, cloneStream(record));
    return cloneStream(record);
  }

  async update(record: StreamRecord): Promise<StreamRecord> {
    if (!this.streams.has(record.streamId)) {
      throw new StreamNotFoundError(record.streamId);
    }

    this.streams.set(record.streamId, cloneStream(record));
    return cloneStream(record);
  }

  async delete(streamId: string): Promise<{ deleted: true; streamId: string }> {
    const existing = this.streams.get(streamId);
    if (existing === undefined) {
      throw new StreamNotFoundError(streamId);
    }

    this.streams.delete(streamId);
    return { deleted: true, streamId };
  }
}

function cloneStream(stream: StreamRecord): StreamRecord {
  return structuredClone(stream);
}
