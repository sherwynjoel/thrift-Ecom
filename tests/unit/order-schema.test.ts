import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";

const nextval = async () => Number((await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`)[0].n);

describe("order number sequence", () => {
  beforeEach(resetDb);

  it("starts at 1001, increments, and restarts with resetDb", async () => {
    expect(await nextval()).toBe(1001);
    expect(await nextval()).toBe(1002);
    await resetDb();
    expect(await nextval()).toBe(1001);
  });
});
