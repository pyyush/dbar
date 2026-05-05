import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAW_CDP_LOGGING_PATTERNS = [
  /print\s*\(\s*browser\.cdp_url\s*\)/,
  /print\s*\(\s*cdp_url\s*\)/,
  /print\s*\(\s*f?["'][^)]*\{\s*cdp_url\s*\}/,
  /console\.log\s*\(\s*cdpUrl\s*\)/,
  /console\.log\s*\(\s*`[^)]*\$\{\s*cdpUrl\s*\}/,
];

describe("browser-use documentation safety", () => {
  it("does not show raw CDP endpoint logging", () => {
    const docs = [
      readFileSync(new URL("./README.md", import.meta.url), "utf8"),
      readFileSync(new URL("./example.py", import.meta.url), "utf8"),
    ].join("\n");

    for (const pattern of RAW_CDP_LOGGING_PATTERNS) {
      expect(docs).not.toMatch(pattern);
    }
  });
});
