export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(what = "Resource") {
    super("NOT_FOUND", `${what} not found`, 404);
  }
}

export class OutOfStockError extends DomainError {
  constructor(public readonly available: number) {
    super("OUT_OF_STOCK", `Only ${available} left in stock`, 409, { available });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have access to this") {
    super("FORBIDDEN", message, 403);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Please log in") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export class ValidationError extends DomainError {
  constructor(fieldErrors: Record<string, string[]>, message = "Invalid input") {
    super("VALIDATION_ERROR", message, 400, fieldErrors);
  }
}

export class RateLimitedError extends DomainError {
  constructor(public readonly retryAfterSec: number) {
    super("RATE_LIMITED", "Too many attempts, try again shortly", 429, { retryAfterSec });
  }
}

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export function toHttp(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof DomainError) {
    const error: ErrorBody["error"] = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    return { status: err.status, body: { error } };
  }
  const id = Math.random().toString(36).slice(2, 10);
  console.error(`[internal:${id}]`, err);
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: `Something went wrong (ref ${id})` } },
  };
}
