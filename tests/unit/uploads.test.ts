import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, newUploadKey, validateImage } from "@/server/uploads";
import { ValidationError } from "@/server/errors";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("validateImage", () => {
  it("detects png, jpg, and webp by magic bytes", () => {
    expect(validateImage(png)).toEqual({ ext: "png", contentType: "image/png" });
    expect(validateImage(jpg)).toEqual({ ext: "jpg", contentType: "image/jpeg" });
    expect(validateImage(webp)).toEqual({ ext: "webp", contentType: "image/webp" });
  });

  it("rejects other bytes and oversize files", () => {
    expect(() => validateImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(ValidationError);
    expect(() => validateImage(new Uint8Array(MAX_UPLOAD_BYTES + 1))).toThrow(ValidationError);
  });

  it("builds random keys under a prefix", () => {
    const k = newUploadKey("products", "png");
    expect(k).toMatch(/^products\/[a-z0-9-]+\.png$/);
    expect(newUploadKey("products", "png")).not.toBe(k);
  });

  it("accepts a larger per-call limit", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 10);
    big.set(png);
    expect(() => validateImage(big)).toThrow(ValidationError);
    expect(validateImage(big, MAX_UPLOAD_BYTES * 2)).toEqual({ ext: "png", contentType: "image/png" });
  });
});
