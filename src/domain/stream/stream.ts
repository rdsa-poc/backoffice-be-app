import { randomBytes } from "node:crypto";

import type { StreamValidationIssue } from "../../shared/errors/stream-errors.ts";
import {
  createActiveStreamDeleteForbiddenError,
  createStreamUnpublishForbiddenError,
  StreamValidationError,
} from "../../shared/errors/stream-errors.ts";

export type StreamStatus = "draft" | "inactive" | "active";

export type StreamRecord = {
  createdAt: string;
  imageUrl: string;
  status: StreamStatus;
  streamId: string;
  streamUrl: string;
  summary: string;
  title: string;
  updatedAt: string;
};

export type StreamListItemDto = {
  availableActions: string[];
  createdAt: string;
  imageUrl: string;
  position: number;
  status: StreamStatus;
  streamId: string;
  title: string;
};

export type StreamDetailDto = StreamRecord;

export type MobileStreamProjectionDto = {
  imageUrl: string;
  streamId: string;
  streamUrl: string;
  summary: string;
  title: string;
};

export type MobileStreamProjectionContract = {
  detailPathPattern: "/mobile/streams/{streamId}";
  discoveryCollectionPath: "/mobile/streams";
  fields: {
    imageUrl: "string";
    streamId: "string";
    streamUrl: "string";
    summary: "string";
    title: "string";
  };
  removalSemantics: {
    detailSelectionMissingProjection: "show-stream-removed-error-and-return-to-discovery";
    missingProjectionRecord: "treat-as-removed-from-mobile-discovery";
    sourceOfTruthStatusesWithoutProjection: ["draft", "inactive"];
  };
  views: {
    detail: ["imageUrl", "title", "summary", "streamUrl"];
    discoveryList: ["imageUrl", "title", "summary"];
  };
};

export type PublishStreamResponseDto = {
  projectionTarget: string;
  status: "active";
  streamId: string;
};

export type UnpublishStreamResponseDto = {
  projectionRemoved: true;
  status: "inactive";
  streamId: string;
};

export type CreateStreamInput = {
  imageUrl?: unknown;
  status?: unknown;
  streamId?: unknown;
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
    createdAt: stream.createdAt,
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

  if (input.streamId !== undefined) {
    issues.push({
      field: "streamId",
      message: "streamId is backend-generated and must not be provided on create.",
    });
  }

  if (input.status !== undefined) {
    issues.push({
      field: "status",
      message: "status is owned by the backend and must not be provided on create.",
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
): Partial<Pick<StreamRecord, "imageUrl" | "streamUrl" | "summary" | "title">> {
  const issues: StreamValidationIssue[] = [];

  if (input.streamId !== undefined && input.streamId !== streamId) {
    issues.push({
      field: "streamId",
      message: "streamId is immutable and must match the route parameter.",
    });
  }

  if (input.status !== undefined) {
    issues.push({
      field: "status",
      message: "status is controlled by publish and unpublish actions.",
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

  const patch: Partial<Pick<StreamRecord, "imageUrl" | "streamUrl" | "summary" | "title">> = {};

  for (const field of ["title", "summary", "streamUrl", "imageUrl"] as const) {
    if (input[field] !== undefined) {
      patch[field] = sanitizeString(input[field]);
    }
  }

  return patch;
}

export function buildUniqueStreamId(
  title: string,
  existingIds: ReadonlySet<string>,
): string {
  const baseStreamId = slugifyTitle(title);
  let candidate = `${baseStreamId}-${randomSuffix()}`;

  while (existingIds.has(candidate)) {
    candidate = `${baseStreamId}-${randomSuffix()}`;
  }

  return candidate;
}

export function buildDraftStream(
  input: CreateStreamInput,
  existingIds: ReadonlySet<string>,
  now = new Date().toISOString(),
): StreamRecord {
  const validatedInput = validateCreateStreamInput(input);

  return {
    createdAt: now,
    imageUrl: validatedInput.imageUrl,
    status: "draft",
    streamId: buildUniqueStreamId(validatedInput.title, existingIds),
    streamUrl: validatedInput.streamUrl,
    summary: validatedInput.summary,
    title: validatedInput.title,
    updatedAt: now,
  };
}

export function applyStreamUpdate(
  existing: StreamRecord,
  streamId: string,
  input: UpdateStreamInput,
  now = new Date().toISOString(),
): StreamRecord {
  const validatedPatch = validateUpdateStreamInput(streamId, input);

  return {
    ...existing,
    ...validatedPatch,
    updatedAt: now,
  };
}

export function assertStreamCanBeDeleted(stream: StreamRecord): void {
  if (stream.status === "active") {
    throw createActiveStreamDeleteForbiddenError();
  }
}

export function assertStreamCanBeUnpublished(stream: StreamRecord): void {
  if (stream.status !== "active") {
    throw createStreamUnpublishForbiddenError();
  }
}

export function buildProjectionTarget(streamId: string): string {
  return `/mobile/streams/${streamId}`;
}

export function buildMobileStreamProjection(
  stream: StreamRecord,
): MobileStreamProjectionDto {
  return {
    imageUrl: stream.imageUrl,
    streamId: stream.streamId,
    streamUrl: stream.streamUrl,
    summary: stream.summary,
    title: stream.title,
  };
}

export function buildMobileStreamProjectionContract(): MobileStreamProjectionContract {
  return {
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
      detailSelectionMissingProjection: "show-stream-removed-error-and-return-to-discovery",
      missingProjectionRecord: "treat-as-removed-from-mobile-discovery",
      sourceOfTruthStatusesWithoutProjection: ["draft", "inactive"],
    },
    views: {
      detail: ["imageUrl", "title", "summary", "streamUrl"],
      discoveryList: ["imageUrl", "title", "summary"],
    },
  };
}

export function buildPublishStreamResponse(
  stream: Pick<StreamRecord, "streamId">,
): PublishStreamResponseDto {
  return {
    projectionTarget: buildProjectionTarget(stream.streamId),
    status: "active",
    streamId: stream.streamId,
  };
}

export function buildUnpublishStreamResponse(
  streamId: string,
): UnpublishStreamResponseDto {
  return {
    projectionRemoved: true,
    status: "inactive",
    streamId,
  };
}

export function buildSeedStream(
  stream: StreamRecord,
): StreamRecord {
  return stream;
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
      return ["publish", "unpublish", "edit", "view"];
    case "inactive":
      return ["publish", "edit", "view", "delete"];
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

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function randomSuffix(): string {
  return randomBytes(2).toString("hex");
}
