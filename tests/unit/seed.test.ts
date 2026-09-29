import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { runSeed } from "@/server/seed/run-seed";
import { teeSvg } from "@/server/seed/tee-svg";

describe("seed", () => {
  beforeEach(resetDb);

  it("renders a shirt svg in the requested color", () => {
    const svg = teeSvg("#c6ff3d", "front");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("#c6ff3d");
  });

  it("creates the admin, collections, products, and variants, and is idempotent", async () => {
    const publicDir = mkdtempSync(join(tmpdir(), "seed-"));
    const opts = { adminEmail: "admin@test.local", adminPassword: "admin-test-password", publicDir };
    const first = await runSeed(db, opts);
    expect(first.collections).toBeGreaterThanOrEqual(5);
    expect(first.products).toBeGreaterThanOrEqual(16);
    expect(first.variants).toBeGreaterThan(100);

    const admin = await db.user.findUnique({ where: { email: "admin@test.local" } });
    expect(admin?.role).toBe("ADMIN");
    expect(admin?.passwordHash).toBeTruthy();

    const customizable = await db.product.count({ where: { isCustomizable: true, status: "ACTIVE" } });
    expect(customizable).toBeGreaterThanOrEqual(1);

    const featured = await db.collection.count({ where: { isFeatured: true } });
    expect(featured).toBe(3);

    const second = await runSeed(db, opts);
    expect(second.products).toBe(first.products);
    expect(await db.product.count()).toBe(first.products);
  });
});
