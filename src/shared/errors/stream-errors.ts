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

export class StreamNotFoundError extends Error {
  constructor(streamId: string) {
    super(`Stream ${streamId} was not found.`);
    this.name = "StreamNotFoundError";
  }
}
