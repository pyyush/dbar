import { describe, it, expect } from "vitest";
import { maskConnectUrl, parseCaptureArgs, parseReplayArgs } from "../helpers.js";

describe("maskConnectUrl", () => {
  it("should mask apiKey query parameter in connectUrl", () => {
    const url =
      "wss://connect.browserbase.com?sessionId=abc123&apiKey=sk-secret-key-value";

    const masked = maskConnectUrl(url);

    expect(masked).toBe(
      "wss://connect.browserbase.com?sessionId=abc123&apiKey=[MASKED]"
    );
  });

  it("should return url unchanged when no apiKey parameter exists", () => {
    const url = "wss://connect.browserbase.com?sessionId=abc123";

    const masked = maskConnectUrl(url);

    expect(masked).toBe(url);
  });

  it("should mask apiKey regardless of parameter position", () => {
    const url =
      "wss://connect.browserbase.com?apiKey=secret&sessionId=abc123&other=val";

    const masked = maskConnectUrl(url);

    expect(masked).toContain("apiKey=[MASKED]");
    expect(masked).toContain("sessionId=abc123");
    expect(masked).toContain("other=val");
    expect(masked).not.toContain("secret");
  });

  it("should handle malformed URLs by returning the original string", () => {
    const notAUrl = "not-a-url-at-all";

    const masked = maskConnectUrl(notAUrl);

    expect(masked).toBe(notAUrl);
  });
});

describe("parseCaptureArgs", () => {
  it("should parse --url flag", () => {
    const result = parseCaptureArgs(["--url", "https://example.com"]);

    expect(result.url).toBe("https://example.com");
  });

  it("should parse --steps flag as number", () => {
    const result = parseCaptureArgs(["--url", "https://example.com", "--steps", "5"]);

    expect(result.steps).toBe(5);
  });

  it("should default steps to 1 when not provided", () => {
    const result = parseCaptureArgs(["--url", "https://example.com"]);

    expect(result.steps).toBe(1);
  });

  it("should parse --output flag", () => {
    const result = parseCaptureArgs([
      "--url",
      "https://example.com",
      "--output",
      "/tmp/my.capsule",
    ]);

    expect(result.output).toBe("/tmp/my.capsule");
  });

  it("should generate default output path when --output not provided", () => {
    const result = parseCaptureArgs(["--url", "https://example.com"]);

    expect(result.output).toMatch(/^.*\/capsules\/\d+\.capsule$/);
  });

  it("should return error when --url is missing", () => {
    const result = parseCaptureArgs(["--steps", "3"]);

    expect(result.error).toBe("--url is required");
  });

  it("should return error when --steps is not a positive integer", () => {
    const result = parseCaptureArgs(["--url", "https://example.com", "--steps", "0"]);

    expect(result.error).toContain("--steps must be a positive integer");
  });

  it("should return error when --steps is not a number", () => {
    const result = parseCaptureArgs(["--url", "https://example.com", "--steps", "abc"]);

    expect(result.error).toContain("--steps must be a positive integer");
  });
});

describe("parseReplayArgs", () => {
  it("should parse capsule path as first positional argument", () => {
    const result = parseReplayArgs(["/path/to/capsule.capsule"]);

    expect(result.capsulePath).toBe("/path/to/capsule.capsule");
  });

  it("should parse --json flag", () => {
    const result = parseReplayArgs(["/path/to/capsule.capsule", "--json"]);

    expect(result.json).toBe(true);
  });

  it("should default json to false", () => {
    const result = parseReplayArgs(["/path/to/capsule.capsule"]);

    expect(result.json).toBe(false);
  });

  it("should return error when capsule path is missing", () => {
    const result = parseReplayArgs([]);

    expect(result.error).toBe("capsule path is required");
  });

  it("should return error when capsule path is missing but --json is present", () => {
    const result = parseReplayArgs(["--json"]);

    expect(result.error).toBe("capsule path is required");
  });
});
