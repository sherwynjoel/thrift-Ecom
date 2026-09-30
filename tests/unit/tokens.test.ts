import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

const TOKENS: Record<string, string> = {
  "--bg": "#0A0A0A",
  "--surface": "#141414",
  "--surface-raised": "#1C1C1C",
  "--border": "#2A2A2A",
  "--text": "#F5F5F0",
  "--text-muted": "#9A9A93",
  "--accent": "#D4FF3F",
  "--accent-ink": "#0A0A0A",
  "--danger": "#FF4D4D",
};

describe("design tokens", () => {
  it("defines every brand token with the exact spec value", () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(css, name).toMatch(new RegExp(`${name}:\\s*${value};`, "i"));
    }
  });

  it("maps the shadcn semantic colors and fonts onto the tokens", () => {
    expect(css).toMatch(/--color-background:\s*var\(--bg\)/);
    expect(css).toMatch(/--color-primary:\s*var\(--accent\)/);
    expect(css).toMatch(/--color-brand:\s*var\(--accent\)/);
    expect(css).toMatch(/--font-display:\s*var\(--font-bebas\)/);
    expect(css).toMatch(/--font-sans:\s*var\(--font-grotesk\)/);
  });

  it("defines raw shadcn color aliases in :root for components that reference them directly", () => {
    expect(css).toMatch(/--popover:\s*var\(--surface-raised\)/);
    expect(css).toMatch(/--secondary:\s*var\(--surface-raised\)/);
  });

  it("pins the dark variant to a .dark class instead of the OS color scheme", () => {
    expect(css).toMatch(/@custom-variant dark \(&:where\(\.dark, \.dark \*\)\);/);
  });

  it("honours reduced motion globally", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
