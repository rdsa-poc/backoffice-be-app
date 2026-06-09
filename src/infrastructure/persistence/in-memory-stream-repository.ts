import {
  buildSeedStream,
  buildUniqueStreamId,
  type CreateStreamInput,
  type StreamRecord,
  type UpdateStreamInput,
  validateCreateStreamInput,
  validateUpdateStreamInput,
} from "../../domain/stream/stream.ts";
import {
  StreamConflictError,
  StreamNotFoundError,
} from "../../shared/errors/stream-errors.ts";

export interface StreamRepository {
  create(input: CreateStreamInput): StreamRecord;
  delete(streamId: string): { deleted: true; streamId: string };
  getById(streamId: string): StreamRecord;
  list(): StreamRecord[];
  update(streamId: string, input: UpdateStreamInput): StreamRecord;
}

const seededStreams: StreamRecord[] = [
  buildSeedStream({
    imageUrl: "https://cdn.example.com/streams/morning-news.jpg",
    publishedAt: "2026-05-20T11:10:00.000Z",
    status: "active",
    streamId: "stream-morning-news",
    streamUrl: "https://radio.example.com/morning-news.m3u8",
    summary: "Fast-moving headlines, weather, and commuter updates.",
    title: "Morning News",
    updatedAt: "2026-05-20T11:30:00.000Z",
  }),
  buildSeedStream({
    imageUrl: "https://cdn.example.com/streams/night-jazz.jpg",
    publishedAt: "2026-05-20T11:10:00.000Z",
    status: "inactive",
    streamId: "stream-night-jazz",
    streamUrl: "https://radio.example.com/night-jazz.m3u8",
    summary: "Late-night jazz programming with host-led transitions.",
    title: "Night Jazz",
    updatedAt: "2026-05-20T11:30:00.000Z",
  }),
  buildSeedStream({
    imageUrl: "https://cdn.example.com/streams/weekend-recap.jpg",
    publishedAt: null,
    status: "draft",
    streamId: "stream-weekend-recap",
    streamUrl: "https://radio.example.com/weekend-recap.m3u8",
    summary: "Highlights and interviews from the last seven days.",
    title: "Weekend Recap",
    updatedAt: "2026-05-20T11:30:00.000Z",
  }),
  buildSeedStream({
    imageUrl: "https://cdn.example.com/streams/lounge-live.jpg",
    publishedAt: "2026-05-20T11:15:00.000Z",
    status: "active",
    streamId: "stream-lounge-live",
    streamUrl: "https://radio.example.com/lounge-live.m3u8",
    summary: "Live lounge sessions with ambient sets and artist drop-ins.",
    title: "Lounge Live",
    updatedAt: "2026-05-20T11:35:00.000Z",
  }),
  buildSeedStream({
    imageUrl: "https://cdn.example.com/streams/indie-preview.jpg",
    publishedAt: "2026-05-20T11:20:00.000Z",
    status: "inactive",
    streamId: "stream-indie-preview",
    streamUrl: "https://radio.example.com/indie-preview.m3u8",
    summary: "New indie tracks queued up ahead of the weekend release cycle.",
    title: "Indie Preview",
    updatedAt: "2026-05-20T11:40:00.000Z",
  }),
];

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

  list(): StreamRecord[] {
    return Array.from(this.streams.values()).map(cloneStream);
  }

  getById(streamId: string): StreamRecord {
    const stream = this.streams.get(streamId);
    if (stream === undefined) {
      throw new StreamNotFoundError(streamId);
    }

    return cloneStream(stream);
  }

  create(input: CreateStreamInput): StreamRecord {
    const now = new Date().toISOString();
    const validatedInput = validateCreateStreamInput(input);
    const streamId = buildUniqueStreamId(validatedInput.title, new Set(this.streams.keys()));

    const createdRecord: StreamRecord = {
      createdAt: now,
      imageUrl: validatedInput.imageUrl,
      projectionSyncState: "in_sync",
      publishedAt: null,
      status: "draft",
      streamId,
      streamUrl: validatedInput.streamUrl,
      summary: validatedInput.summary,
      title: validatedInput.title,
      updatedAt: now,
    };

    this.streams.set(streamId, createdRecord);
    return cloneStream(createdRecord);
  }

  update(streamId: string, input: UpdateStreamInput): StreamRecord {
    const existing = this.streams.get(streamId);
    if (existing === undefined) {
      throw new StreamNotFoundError(streamId);
    }

    const validatedPatch = validateUpdateStreamInput(streamId, input);
    const updatedRecord: StreamRecord = {
      ...existing,
      ...validatedPatch,
      updatedAt: new Date().toISOString(),
    };

    this.streams.set(streamId, updatedRecord);
    return cloneStream(updatedRecord);
  }

  delete(streamId: string): { deleted: true; streamId: string } {
    const existing = this.streams.get(streamId);
    if (existing === undefined) {
      throw new StreamNotFoundError(streamId);
    }

    if (existing.status === "active") {
      throw new StreamConflictError(
        "ACTIVE_STREAM_DELETE_FORBIDDEN",
        "Active streams must be deactivated before deletion.",
      );
    }

    this.streams.delete(streamId);
    return { deleted: true, streamId };
  }
}

function cloneStream(stream: StreamRecord): StreamRecord {
  return structuredClone(stream);
}
