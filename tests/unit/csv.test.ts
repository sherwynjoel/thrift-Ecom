import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("quotes, escapes and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a", "b,c", 'say "hi"', null, 12], ["line\nbreak", "=SUM(A1)", "+91 98765", "-x", "@me"]])).toBe(
      'a,"b,c","say ""hi""",,12\r\n"line\nbreak",\'=SUM(A1),\'+91 98765,\'-x,\'@me\r\n',
    );
  });
});
