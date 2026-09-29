import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slug", () => {
  it("slugifies names", () => {
    expect(slugify("Originals Beige Oversized T-shirt")).toBe("originals-beige-oversized-t-shirt");
    expect(slugify("  Hello   World! ")).toBe("hello-world");
    expect(slugify("Ünïcode & symbols")).toBe("unicode-symbols");
  });

  it("appends a counter until the slug is free", async () => {
    const taken = new Set(["tee", "tee-2"]);
    const exists = async (s: string) => taken.has(s);
    expect(await uniqueSlug("tee", exists)).toBe("tee-3");
    expect(await uniqueSlug("fresh", exists)).toBe("fresh");
  });
});
