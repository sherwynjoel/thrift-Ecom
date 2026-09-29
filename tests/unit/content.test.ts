import { describe, expect, it } from "vitest";
import { readPage } from "@/server/content";

describe("readPage", () => {
  it("reads a markdown page and splits the title", async () => {
    const page = await readPage("shipping");
    expect(page?.title).toBe("Shipping");
    expect(page?.body).toContain("prepaid");
  });

  it("returns null for missing or unsafe slugs", async () => {
    expect(await readPage("does-not-exist")).toBeNull();
    expect(await readPage("../package")).toBeNull();
  });
});
