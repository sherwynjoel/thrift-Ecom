import type { ZodError } from "zod";
import { ConflictError, DomainError, ValidationError } from "@/server/errors";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function actionError(err: unknown): ActionResult<never> {
  if (err instanceof ValidationError) {
    return { ok: false, message: err.message, fieldErrors: (err.details as Record<string, string[]>) ?? {} };
  }
  // A ConflictError may carry field-level details (e.g. a slug taken by a concurrent save); surface them
  // the same way a ValidationError does so the form can highlight the right input.
  if (err instanceof ConflictError && err.details) {
    return { ok: false, message: err.message, fieldErrors: err.details as Record<string, string[]> };
  }
  if (err instanceof DomainError) return { ok: false, message: err.message };
  console.error("[action]", err);
  return { ok: false, message: "Something went wrong. Please try again." };
}
