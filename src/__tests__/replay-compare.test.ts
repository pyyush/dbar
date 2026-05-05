import { beforeEach, describe, expect, it, vi } from "vitest";

const captureDOMSnapshot = vi.hoisted(() => vi.fn());
const captureAccessibilitySnapshot = vi.hoisted(() => vi.fn());
const captureScreenshot = vi.hoisted(() => vi.fn());

vi.mock("../snapshot/dom.js", () => ({
  captureDOMSnapshot,
}));

vi.mock("../snapshot/accessibility.js", () => ({
  captureAccessibilitySnapshot,
}));

vi.mock("../snapshot/screenshot.js", () => ({
  captureScreenshot,
}));

import { compareReplayStep, countFailedSteps } from "../replay/compare.js";

function makeExpectedStep() {
  return {
    index: 0,
    label: "loaded",
    observables: {
      domSnapshotHash: "dom-hash",
      accessibilityHash: "a11y-hash",
      screenshotHash: "ss-hash",
      networkDigest: "network-hash",
    },
    artifacts: {
      domSnapshot: "snapshots/0/dom.json",
      accessibilityYaml: "snapshots/0/accessibility.json",
      screenshot: "snapshots/0/screenshot.png",
    },
  };
}

describe("compareReplayStep", () => {
  beforeEach(() => {
    captureDOMSnapshot.mockResolvedValue({ hash: "dom-hash" });
    captureAccessibilitySnapshot.mockResolvedValue({ hash: "a11y-hash" });
    captureScreenshot.mockResolvedValue({ hash: "ss-hash" });
  });

  it("shouldFailStepWhenNetworkDigestDiffers", async () => {
    const comparison = await compareReplayStep({
      expectedStep: makeExpectedStep() as any,
      page: {} as any,
      cdpSession: {} as any,
      network: {
        getStepNetworkDigest: vi.fn().mockReturnValue("live-network-hash"),
        getDivergencesForStep: vi.fn().mockReturnValue([]),
      },
      timeVirtualizer: {
        pause: vi.fn().mockResolvedValue(undefined),
        waitForQuiescence: vi.fn().mockResolvedValue({ quiescent: true }),
      },
      options: {},
    });

    expect(comparison.matched).toBe(false);
    expect(comparison.liveObservables.networkDigest).toBe("live-network-hash");
    expect(comparison.stepDivergences).toContainEqual(
      expect.objectContaining({ type: "network_digest_mismatch" })
    );
  });

  it("shouldFailStepWhenReplayerRecordedUnmatchedRequests", async () => {
    const comparison = await compareReplayStep({
      expectedStep: makeExpectedStep() as any,
      page: {} as any,
      cdpSession: {} as any,
      network: {
        getStepNetworkDigest: vi.fn().mockReturnValue("network-hash"),
        getDivergencesForStep: vi.fn().mockReturnValue([
          { step: 0, type: "unmatched_request", details: "GET /api" },
        ]),
      },
      timeVirtualizer: {
        pause: vi.fn().mockResolvedValue(undefined),
        waitForQuiescence: vi.fn().mockResolvedValue({ quiescent: true }),
      },
      options: {},
    });

    expect(comparison.matched).toBe(false);
    expect(comparison.stepDivergences).toContainEqual(
      expect.objectContaining({ type: "unmatched_request" })
    );
  });

  it("shouldKeepScreenshotMismatchAdvisory", async () => {
    captureScreenshot.mockResolvedValueOnce({ hash: "different-ss-hash" });

    const comparison = await compareReplayStep({
      expectedStep: makeExpectedStep() as any,
      page: {} as any,
      cdpSession: {} as any,
      network: {
        getStepNetworkDigest: vi.fn().mockReturnValue("network-hash"),
        getDivergencesForStep: vi.fn().mockReturnValue([]),
      },
      timeVirtualizer: {
        pause: vi.fn().mockResolvedValue(undefined),
        waitForQuiescence: vi.fn().mockResolvedValue({ quiescent: true }),
      },
      options: { compareScreenshots: true },
    });

    expect(comparison.matched).toBe(true);
    expect(comparison.stepDivergences).toContainEqual(
      expect.objectContaining({ type: "screenshot_mismatch" })
    );
  });
});

describe("countFailedSteps", () => {
  it("shouldDeduplicateStepFailuresAndIgnoreAdvisoryScreenshotDiffs", () => {
    const failedSteps = countFailedSteps([
      { step: 0, type: "dom_mismatch" },
      { step: 0, type: "accessibility_mismatch" },
      { step: 0, type: "screenshot_mismatch" },
      { step: 1, type: "screenshot_mismatch" },
    ] as any);

    expect(failedSteps).toBe(1);
  });
});
