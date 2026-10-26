import type { Job } from "./types.js";

export class RuncrateError extends Error {
  /**
   * The idempotency key of the call that failed, when it had one (`billing.topUp`). Send the
   * same key again to read or finish that call instead of starting a new one.
   */
  idempotencyKey?: string;

  constructor(message: string) {
    super(message);
    this.name = "RuncrateError";
  }
}

export class ApiError extends RuncrateError {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 400, code, details);
    this.name = "BadRequestError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 401, code, details);
    this.name = "AuthenticationError";
  }
}

/**
 * HTTP 402. `code` tells the cases apart: `"insufficient_credits"` when the workspace balance is
 * too low, `"BUDGET_REACHED"` when a launch hits an environment's monthly budget, and
 * `"budget_exceeded"` when an inference call hits it.
 */
export class InsufficientCreditsError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 402, code, details);
    this.name = "InsufficientCreditsError";
  }
}

export class PermissionDeniedError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 403, code, details);
    this.name = "PermissionDeniedError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 404, code, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 409, code, details);
    this.name = "ConflictError";
  }
}

export class UnprocessableEntityError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 422, code, details);
    this.name = "UnprocessableEntityError";
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 429, code, details);
    this.name = "RateLimitError";
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 500, code, details);
    this.name = "InternalServerError";
  }
}

export class ConnectionError extends RuncrateError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

export class TimeoutError extends RuncrateError {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/** `jobs.wait()` ran out of time before the job ended. `job` is the job as last seen (still live). */
export class JobWaitTimeoutError extends TimeoutError {
  readonly job: Job;

  constructor(message: string, job: Job) {
    super(message);
    this.name = "JobWaitTimeoutError";
    this.job = job;
  }
}

type ApiErrorConstructor = new (
  message: string,
  code: string,
  details?: Record<string, unknown>,
) => ApiError;

const STATUS_MAP: Record<number, ApiErrorConstructor> = {
  400: BadRequestError,
  401: AuthenticationError,
  402: InsufficientCreditsError,
  403: PermissionDeniedError,
  404: NotFoundError,
  409: ConflictError,
  422: UnprocessableEntityError,
  429: RateLimitError,
  500: InternalServerError,
};

function extractErrorInfo(body: unknown): {
  message: string | null;
  code: string | null;
  details: Record<string, unknown> | undefined;
} {
  if (!body || typeof body !== "object") {
    return { message: null, code: null, details: undefined };
  }

  const b = body as Record<string, unknown>;

  // Format: { error: { code, message, details } }
  if (b.error && typeof b.error === "object") {
    const e = b.error as Record<string, unknown>;
    return {
      message: (e.message as string) ?? null,
      code: (e.code as string) ?? null,
      details: e.details as Record<string, unknown> | undefined,
    };
  }

  // Format: { error: "string message" }
  if (typeof b.error === "string") {
    return { message: b.error, code: null, details: undefined };
  }

  // Format: { message: "string" }
  if (typeof b.message === "string") {
    return { message: b.message, code: (b.code as string) ?? null, details: undefined };
  }

  // Format: { detail: "string" } (FastAPI style)
  if (typeof b.detail === "string") {
    return { message: b.detail, code: null, details: undefined };
  }

  // Unknown format — stringify the whole body
  return { message: JSON.stringify(body), code: null, details: undefined };
}

export function makeApiError(
  statusCode: number,
  body: unknown,
  fallbackMessage: string,
): ApiError {
  const { message: extractedMessage, code: extractedCode, details } = extractErrorInfo(body);
  const message = extractedMessage ?? fallbackMessage;
  const code = extractedCode ?? "api_error";

  const Cls = STATUS_MAP[statusCode];
  if (!Cls) {
    return new ApiError(message, statusCode, code, details);
  }
  return new Cls(message, code, details);
}
