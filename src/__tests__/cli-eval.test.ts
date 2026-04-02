import { describe, it, expect } from "vitest";
import { checkAssertion, type Assertion } from "../cli/eval.js";
import type { CapsuleArchive } from "../capsule/builder.js";
import type { DeterminismCapsule } from "../capsule/types.js";

// Minimal capsule fixture for assertion checking
function makeCapsule(overrides?: Partial<DeterminismCapsule>): CapsuleArchive {
  const manifest: DeterminismCapsule = {
    version: "1.0.0",
    capsuleProfile: "replay",
    id: "00000000-0000-0000-0000-000000000001",
    createdAt: "2024-01-01T00:00:00.000Z",
    environment: {
      browserBuild: "chromium/1140",
      browserFlags: [],
      locale: "en-US",
      timezone: "UTC",
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      userAgent: "Mozilla/5.0",
      offline: false,
    },
    seeds: { initialTime: 1700000000000 },
    initialState: {
      url: "https://example.com",
      cookies: [],
      localStorage: [],
      unsupportedState: ["sessionStorage"],
    },
    networkTranscript: {
      orderingPolicy: "creation",
      entries: [
        {
          index: 0, requestId: "r1", url: "https://example.com/api",
          method: "GET", headers: {}, requestHash: "h1", occurrenceIndex: 0, timestamp: 0,
          response: { status: 200, headers: {}, body: "network/abc", bodyHash: "abc" },
        },
        {
          index: 1, requestId: "r2", url: "https://example.com/style.css",
          method: "GET", headers: {}, requestHash: "h2", occurrenceIndex: 0, timestamp: 1,
          response: { status: 200, headers: {}, body: "network/def", bodyHash: "def" },
        },
      ],
    },
    steps: [
      {
        index: 0, label: "loaded",
        observables: {
          domSnapshotHash: "dom0", accessibilityHash: "a11y0",
          screenshotHash: "ss0", networkDigest: "nd0",
        },
        artifacts: {
          domSnapshot: "snapshots/0/dom.json",
          accessibilityYaml: "snapshots/0/accessibility.json",
          screenshot: "snapshots/0/screenshot.png",
        },
      },
      {
        index: 1, label: "after-login",
        observables: {
          domSnapshotHash: "dom1", accessibilityHash: "a11y1",
          screenshotHash: "ss1", networkDigest: "nd1",
        },
        artifacts: {
          domSnapshot: "snapshots/1/dom.json",
          accessibilityYaml: "snapshots/1/accessibility.json",
          screenshot: "snapshots/1/screenshot.png",
        },
      },
    ],
    metrics: {
      totalSteps: 2, totalNetworkRequests: 2,
      unsupportedRequestCount: 0, captureOverheadMs: 100, capsuleSizeBytes: 500,
    },
    ...overrides,
  };

  const files = new Map<string, Buffer>();
  files.set("capsule.json", Buffer.from(JSON.stringify(manifest)));
  files.set("snapshots/0/dom.json", Buffer.from("{}"));
  files.set("snapshots/0/accessibility.json", Buffer.from(JSON.stringify({ role: "WebArea", name: "Welcome Dashboard" })));
  files.set("snapshots/0/screenshot.png", Buffer.from("PNG"));
  files.set("snapshots/1/dom.json", Buffer.from("{}"));
  files.set("snapshots/1/accessibility.json", Buffer.from(JSON.stringify({ role: "WebArea", name: "User Profile" })));
  files.set("snapshots/1/screenshot.png", Buffer.from("PNG"));

  return { manifest, files };
}

describe("checkAssertion", () => {
  it("should pass url_contains when URL matches", () => {
    const archive = makeCapsule({
      initialState: {
        url: "https://example.com/dashboard",
        cookies: [], localStorage: [], unsupportedState: ["sessionStorage"],
      },
    });
    const assertion: Assertion = {
      step: "loaded",
      expect: { url_contains: "example.com" },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail url_contains when URL does not match", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { url_contains: "/results" },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("/results");
  });

  it("should pass dom_hash_stable when hash is non-empty", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { dom_hash_stable: true },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should pass accessibility_contains when text is found", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { accessibility_contains: "Welcome" },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail accessibility_contains when text is not found", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { accessibility_contains: "Nonexistent" },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("Nonexistent");
  });

  it("should pass network_count_gte when count meets threshold", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { network_count_gte: 2 },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail network_count_gte when count is below threshold", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { network_count_gte: 10 },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
  });

  it("should pass network_count_lte when count is within limit", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { network_count_lte: 5 },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail network_count_lte when count exceeds limit", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { network_count_lte: 1 },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
  });

  it("should pass screenshot_exists when screenshot artifact exists", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { screenshot_exists: true },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail screenshot_exists when screenshot artifact is missing", () => {
    const archive = makeCapsule();
    archive.files.delete("snapshots/0/screenshot.png");
    const assertion: Assertion = {
      step: "loaded",
      expect: { screenshot_exists: true },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
  });

  it("should return error when step label is not found", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "nonexistent-step",
      expect: { dom_hash_stable: true },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("nonexistent-step");
  });

  it("should check multiple expectations in a single assertion", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: {
        dom_hash_stable: true,
        screenshot_exists: true,
        network_count_gte: 1,
      },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail if any expectation in a multi-check assertion fails", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: {
        dom_hash_stable: true,
        url_contains: "/nonexistent",
      },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
  });

  it("should pass initial_url_contains as alias for url_contains", () => {
    const archive = makeCapsule({
      initialState: {
        url: "https://example.com/dashboard",
        cookies: [], localStorage: [], unsupportedState: ["sessionStorage"],
      },
    });
    const assertion: Assertion = {
      step: "loaded",
      expect: { initial_url_contains: "example.com" },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(true);
  });

  it("should fail initial_url_contains when URL does not match", () => {
    const archive = makeCapsule();
    const assertion: Assertion = {
      step: "loaded",
      expect: { initial_url_contains: "/nonexistent" },
    };

    const result = checkAssertion(archive, assertion);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("initial_url_contains");
  });
});
