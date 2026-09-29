import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";

describe("database connection", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("starts empty and can insert a user", async () => {
    expect(await db.user.count()).toBe(0);
    await db.user.create({ data: { email: "a@test.local", name: "A" } });
    expect(await db.user.count()).toBe(1);
  });
});
