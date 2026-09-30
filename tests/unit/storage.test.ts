import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDiskStorage } from "@/server/adapters/storage/local-disk";

describe("LocalDiskStorage", () => {
  it("writes, exposes a public url, and deletes", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root, "/api/uploads");
    const { url } = await s.put("products/abc.png", new Uint8Array([1, 2, 3]), "image/png");
    expect(url).toBe("/api/uploads/products/abc.png");
    expect(readFileSync(join(root, "products", "abc.png"))).toEqual(Buffer.from([1, 2, 3]));
    await s.delete("products/abc.png");
    expect(existsSync(join(root, "products", "abc.png"))).toBe(false);
    await expect(s.delete("products/abc.png")).resolves.toBeUndefined();
  });

  it("refuses keys that escape the root", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root);
    await expect(s.put("../evil.png", new Uint8Array([1]), "image/png")).rejects.toThrow();
  });

  it("refuses empty or root keys", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root);
    await expect(s.put("", new Uint8Array([1]), "image/png")).rejects.toThrow();
    await expect(s.put(".", new Uint8Array([1]), "image/png")).rejects.toThrow();
  });

  it("reads a stored file back and returns null when it is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "store-"));
    const s = new LocalDiskStorage(root, "/api/uploads");
    await s.put("designs/print/a.png", new Uint8Array([7, 8, 9]), "image/png");
    expect(Array.from((await s.get("designs/print/a.png"))!)).toEqual([7, 8, 9]);
    expect(await s.get("designs/print/missing.png")).toBeNull();
    await expect(s.get("../escape.png")).rejects.toThrow();
  });
});
