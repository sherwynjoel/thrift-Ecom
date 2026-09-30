import { describe, expect, it } from "vitest";
import { jsonLdScript } from "@/lib/json-ld";

describe("jsonLdScript", () => {
  it("escapes </script> breakout attempts and round-trips through JSON.parse", () => {
    const input = { description: "</script><script>alert(1)</script>" };
    const out = jsonLdScript(input);
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual(input);
  });
});
