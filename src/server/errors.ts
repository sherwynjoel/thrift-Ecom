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
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super("CONFLICT", message, 409, fieldErrors);
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

export class ServiceUnavailableError extends DomainError {
  constructor(public readonly retryAfterSec: number, message = "The server is busy. Please try again shortly.") {
    super("SERVICE_UNAVAILABLE", message, 503, { retryAfterSec });
  }
}

export class PaymentError extends DomainError {
  constructor(message = "The payment could not be processed. Please try again.") {
    super("PAYMENT_ERROR", message, 502);
  }
}

export class LengthRequiredError extends DomainError {
  constructor() {
    super("LENGTH_REQUIRED", "Upload size unknown. Please try again.", 411);
  }
}

export class PayloadTooLargeError extends DomainError {
  constructor(message = "This upload is too large") {
    super("PAYLOAD_TOO_LARGE", message, 413);
  }
}

export interface StockIssue { variantId: string; name: string; requested: number; available: number }

export class StockChangedError extends DomainError {
  constructor(public readonly issues: StockIssue[]) {
    super("STOCK_CHANGED", "Some items just sold out or ran low, so we updated your bag. Please review it and try again.", 409, { issues });
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
