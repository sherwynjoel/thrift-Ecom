import { describe, expect, it } from "vitest";
import { z } from "zod";
import { actionError, zodFieldErrors } from "@/server/action-result";
import { NotFoundError, OutOfStockError, ValidationError } from "@/server/errors";

describe("action-result", () => {
  it("maps domain errors to messages and validation errors to field errors", () => {
    expect(actionError(new NotFoundError("Variant"))).toEqual({ ok: false, message: "Variant not found" });
    expect(actionError(new OutOfStockError(2))).toEqual({ ok: false, message: "Only 2 left in stock" });
    expect(actionError(new ValidationError({ email: ["Invalid email"] }))).toEqual({
      ok: false, message: "Invalid input", fieldErrors: { email: ["Invalid email"] },
    });
  });

  it("hides unknown errors behind a generic message", () => {
    const r = actionError(new Error("db exploded"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain("exploded");
  });

  it("flattens zod issues per field", () => {
    const parsed = z.object({ name: z.string().min(2, "Too short"), age: z.number() }).safeParse({ name: "a", age: "x" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(zodFieldErrors(parsed.error)).toEqual({ name: ["Too short"], age: [expect.any(String)] });
  });
});
