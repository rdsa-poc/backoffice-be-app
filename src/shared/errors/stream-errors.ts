export type StreamValidationIssue = {
  field: string;
  message: string;
};

export class StreamValidationError extends Error {
  readonly issues: StreamValidationIssue[];

  constructor(issues: StreamValidationIssue[]) {
    super("Stream validation failed.");
    this.name = "StreamValidationError";
    this.issues = issues;
  }
}

export class StreamConflictError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 409) {
    super(message);
    this.name = "StreamConflictError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function createActiveStreamDeleteForbiddenError(): StreamConflictError {
  return new StreamConflictError(
    "ACTIVE_STREAM_DELETE_FORBIDDEN",
    "Active streams must be unpublished before deletion.",
  );
}

export function createStreamUnpublishForbiddenError(): StreamConflictError {
  return new StreamConflictError(
    "STREAM_UNPUBLISH_FORBIDDEN",
    "Only active streams can be unpublished.",
  );
}

export class StreamRealtimeSyncError extends Error {
  readonly action: "publish" | "unpublish";
  readonly code: string;
  readonly projectionTarget: string;
  readonly statusCode: number;

  constructor(action: "publish" | "unpublish", projectionTarget: string, message: string) {
    super(message);
    this.name = "StreamRealtimeSyncError";
    this.action = action;
    this.code = "STREAM_REALTIME_SYNC_UNAVAILABLE";
    this.projectionTarget = projectionTarget;
    this.statusCode = 503;
  }
}

export function createStreamRealtimeSyncUnavailableError(
  action: "publish" | "unpublish",
  projectionTarget: string,
): StreamRealtimeSyncError {
  const actionLabel = action === "publish" ? "Publish" : "Unpublish";
  return new StreamRealtimeSyncError(
    action,
    projectionTarget,
    `${actionLabel} requires realtime projection mutation support before the lifecycle contract can succeed.`,
  );
}

export class StreamNotFoundError extends Error {
  constructor(streamId: string) {
    super(`Stream ${streamId} was not found.`);
    this.name = "StreamNotFoundError";
  }
}
