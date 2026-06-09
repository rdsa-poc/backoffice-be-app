import type { StreamValidationIssue } from "../../shared/errors/stream-errors.ts";
import { StreamValidationError } from "../../shared/errors/stream-errors.ts";

export type StreamStatus = "draft" | "inactive" | "active";

export type StreamRecord = {
  createdAt: string;
  imageUrl: string;
  projectionSyncState: "in_sync" | "sync_error";
  publishedAt: string | null;
  status: StreamStatus;
  streamId: string;
  streamUrl: string;
  summary: string;
  title: string;
  updatedAt: string;
};

export type StreamListItemDto = {
  availableActions: string[];
  imageUrl: string;
  position: number;
  status: StreamStatus;
  streamId: string;
  title: string;
};

export type StreamDetailDto = StreamRecord;

export type CreateStreamInput = {
  imageUrl?: unknown;
  status?: unknown;
  streamUrl?: unknown;
  summary?: unknown;
  title?: unknown;
};

export type UpdateStreamInput = {
  imageUrl?: unknown;
  status?: unknown;
  streamId?: unknown;
  streamUrl?: unknown;
  summary?: unknown;
  title?: unknown;
};

export function toStreamListItemDto(
  stream: StreamRecord,
  position: number,
): StreamListItemDto {
  return {
    availableActions: listAvailableActions(stream.status),
    imageUrl: stream.imageUrl,
    position,
    status: stream.status,
    streamId: stream.streamId,
    title: stream.title,
  };
}

export function validateCreateStreamInput(input: CreateStreamInput): {
  imageUrl: string;
  streamUrl: string;
  summary: string;
  title: string;
} {
  const issues = collectEditableFieldIssues(input);

  if (input.status !== undefined && input.status !== "draft") {
    issues.push({
      field: "status",
      message: "Created streams must start in draft status.",
    });
  }

  if (issues.length > 0) {
    throw new StreamValidationError(issues);
  }

  return {
    imageUrl: sanitizeString(input.imageUrl),
    streamUrl: sanitizeString(input.streamUrl),
    summary: sanitizeString(input.summary),
    title: sanitizeString(input.title),
  };
}

export function validateUpdateStreamInput(
  streamId: string,
  input: UpdateStreamInput,
): Partial<Pick<StreamRecord, "imageUrl" | "status" | "streamUrl" | "summary" | "title">> {
  const issues: StreamValidationIssue[] = [];

  if (input.streamId !== undefined && input.streamId !== streamId) {
    issues.push({
      field: "streamId",
      message: "streamId is immutable and must match the route parameter.",
    });
  }

  if (input.status !== undefined && !isStreamStatus(input.status)) {
    issues.push({
      field: "status",
      message: "status must be one of draft, inactive, or active.",
    });
  }

  for (const field of ["title", "summary", "streamUrl", "imageUrl"] as const) {
    const value = input[field];
    if (value === undefined) {
      continue;
    }

    if (!isNonEmptyString(value)) {
      issues.push({
        field,
        message: `${field} is required.`,
      });
      continue;
    }

    if ((field === "streamUrl" || field === "imageUrl") && !isValidHttpUrl(value)) {
      issues.push({
        field,
        message: `${field} must be a valid http or https URL.`,
      });
    }
  }

  if (issues.length > 0) {
    throw new StreamValidationError(issues);
  }

  const patch: Partial<Pick<StreamRecord, "imageUrl" | "status" | "streamUrl" | "summary" | "title">> = {};

  for (const field of ["title", "summary", "streamUrl", "imageUrl"] as const) {
    if (input[field] !== undefined) {
      patch[field] = sanitizeString(input[field]);
    }
  }

  if (input.status !== undefined) {
    patch.status = input.status;
  }

  return patch;
}

export function buildUniqueStreamId(
  title: string,
  existingIds: ReadonlySet<string>,
): string {
  const baseStreamId = slugifyTitle(title);
  let candidate = baseStreamId;
  let suffix = 2;

  while (existingIds.has(candidate)) {
    candidate = `${baseStreamId}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function buildSeedStream(
  stream: Omit<StreamRecord, "createdAt" | "projectionSyncState"> & { updatedAt: string },
): StreamRecord {
  return {
    ...stream,
    createdAt: "2026-05-20T11:00:00.000Z",
    projectionSyncState: "in_sync",
  };
}

function collectEditableFieldIssues(
  input: Pick<CreateStreamInput, "imageUrl" | "streamUrl" | "summary" | "title">,
): StreamValidationIssue[] {
  const issues: StreamValidationIssue[] = [];

  for (const field of ["title", "summary", "streamUrl", "imageUrl"] as const) {
    const value = input[field];

    if (!isNonEmptyString(value)) {
      issues.push({
        field,
        message: `${field} is required.`,
      });
      continue;
    }

    if ((field === "streamUrl" || field === "imageUrl") && !isValidHttpUrl(value)) {
      issues.push({
        field,
        message: `${field} must be a valid http or https URL.`,
      });
    }
  }

  return issues;
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug === "" ? "stream-untitled" : `stream-${slug}`;
}

function listAvailableActions(status: StreamStatus): string[] {
  switch (status) {
    case "active":
      return ["deactivate", "edit", "view"];
    case "inactive":
      return ["activate", "edit", "view", "delete"];
    case "draft":
      return ["publish", "edit", "view", "delete"];
  }
}

function sanitizeString(value: unknown): string {
  return String(value).trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStreamStatus(value: unknown): value is StreamStatus {
  return value === "draft" || value === "inactive" || value === "active";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
