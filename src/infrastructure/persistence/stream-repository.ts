import {
  buildSeedStream,
  type StreamRecord,
} from "../../domain/stream/stream.ts";

export interface StreamRepository {
  create(record: StreamRecord): Promise<StreamRecord>;
  delete(streamId: string): Promise<{ deleted: true; streamId: string }>;
  getById(streamId: string): Promise<StreamRecord>;
  list(): Promise<StreamRecord[]>;
  update(record: StreamRecord): Promise<StreamRecord>;
}

export const seededStreams: StreamRecord[] = [
  buildSeedStream({
    createdAt: "2026-05-20T11:40:00.000Z",
    imageUrl: "https://cdn.example.com/streams/morning-news.jpg",
    status: "active",
    streamId: "stream-morning-news",
    streamUrl: "https://radio.example.com/morning-news.m3u8",
    summary: "Fast-moving headlines, weather, and commuter updates.",
    title: "Morning News",
    updatedAt: "2026-05-20T11:45:00.000Z",
  }),
  buildSeedStream({
    createdAt: "2026-05-20T11:30:00.000Z",
    imageUrl: "https://cdn.example.com/streams/night-jazz.jpg",
    status: "inactive",
    streamId: "stream-night-jazz",
    streamUrl: "https://radio.example.com/night-jazz.m3u8",
    summary: "Late-night jazz programming with host-led transitions.",
    title: "Night Jazz",
    updatedAt: "2026-05-20T11:35:00.000Z",
  }),
  buildSeedStream({
    createdAt: "2026-05-20T11:20:00.000Z",
    imageUrl: "https://cdn.example.com/streams/weekend-recap.jpg",
    status: "draft",
    streamId: "stream-weekend-recap",
    streamUrl: "https://radio.example.com/weekend-recap.m3u8",
    summary: "Highlights and interviews from the last seven days.",
    title: "Weekend Recap",
    updatedAt: "2026-05-20T11:25:00.000Z",
  }),
  buildSeedStream({
    createdAt: "2026-05-20T11:10:00.000Z",
    imageUrl: "https://cdn.example.com/streams/lounge-live.jpg",
    status: "active",
    streamId: "stream-lounge-live",
    streamUrl: "https://radio.example.com/lounge-live.m3u8",
    summary: "Live lounge sessions with ambient sets and artist drop-ins.",
    title: "Lounge Live",
    updatedAt: "2026-05-20T11:35:00.000Z",
  }),
  buildSeedStream({
    createdAt: "2026-05-20T11:00:00.000Z",
    imageUrl: "https://cdn.example.com/streams/indie-preview.jpg",
    status: "inactive",
    streamId: "stream-indie-preview",
    streamUrl: "https://radio.example.com/indie-preview.m3u8",
    summary: "New indie tracks queued up ahead of the weekend release cycle.",
    title: "Indie Preview",
    updatedAt: "2026-05-20T11:40:00.000Z",
  }),
];
