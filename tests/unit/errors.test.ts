import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, OutOfStockError, ValidationError, toHttp } from "@/server/errors";

describe("domain errors", () => {
  it("maps known errors to status and envelope", () => {
    expect(toHttp(new NotFoundError("Product"))).toEqual({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Product not found" } },
    });
    expect(toHttp(new OutOfStockError(3)).status).toBe(409);
    expect(toHttp(new ConflictError("Slug already in use")).body.error.code).toBe("CONFLICT");
    const v = toHttp(new ValidationError({ email: ["Invalid email"] }));
    expect(v.status).toBe(400);
    expect(v.body.error.details).toEqual({ email: ["Invalid email"] });
  });

  it("hides unknown errors behind a generic 500", () => {
    const res = toHttp(new Error("db exploded"));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.body.error.message).not.toContain("exploded");
  });
});
