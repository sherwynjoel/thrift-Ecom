import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDb } from "../helpers/db";
import { ValidationError } from "@/server/errors";
import { countSubscribers, exportSubscribersCsv, subscribe } from "@/server/services/subscribers";

describe("subscribers", () => {
  beforeEach(resetDb);

  it("stores a normalised email once per form and exports them", async () => {
    await subscribe("  Asha@Example.com ", "newsletter");
    await subscribe("asha@example.com", "newsletter");
    await subscribe("asha@example.com", "studio");
    expect(await countSubscribers()).toBe(2);
    expect((await db.subscriber.findMany()).every((s) => s.email === "asha@example.com")).toBe(true);
    const csv = await exportSubscribersCsv();
    expect(csv.split("\r\n")[0]).toBe("Email,Signed up from,Date");
    expect(csv).toContain("Design studio (notify me)");
  });

  it("rejects an invalid email", async () => {
    await expect(subscribe("not-an-email", "newsletter")).rejects.toBeInstanceOf(ValidationError);
    expect(await countSubscribers()).toBe(0);
  });
});
