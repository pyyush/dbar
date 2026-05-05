import { describe, expect, it, vi } from "vitest";

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

import { ReplaySession } from "../sdk.js";

function makeStep(index: number) {
  return {
    index,
    label: `step-${index}`,
    observables: {
      domSnapshotHash: `dom-${index}`,
      accessibilityHash: `a11y-${index}`,
      screenshotHash: `screenshot-${index}`,
      networkDigest: `network-${index}`,
    },
    artifacts: {
      domSnapshot: `snapshots/${index}/dom.json`,
      accessibilityYaml: `snapshots/${index}/accessibility.json`,
      screenshot: `snapshots/${index}/screenshot.png`,
    },
  };
}

function makeReplaySessionState(overrides: Record<string, unknown> = {}) {
  return {
    page: {} as any,
    cdpSession: {} as any,
    archive: {
      manifest: {
        steps: [{ index: 0 }],
      },
    },
    options: {},
    replayer: {
      setStepIndex: vi.fn(),
      getStepNetworkDigest: vi.fn().mockReturnValue(""),
      getDivergencesForStep: vi.fn().mockReturnValue([]),
      getDivergences: vi.fn().mockReturnValue([]),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    timeVirtualizer: {
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(undefined),
      waitForQuiescence: vi.fn().mockResolvedValue({ quiescent: true }),
      suspend: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    timeVirtualizerStarted: true,
    trace: {
      recordSnapshot: vi.fn(),
      recordSession: vi.fn(),
    },
    divergences: [],
    stepIndex: 1,
    matchedSteps: 1,
    timeToDivergence: undefined,
    startTime: Date.now(),
    ...overrides,
  };
}

describe("ReplaySession.finish", () => {
  it("shouldTreatScreenshotMismatchAsAdvisory", async () => {
    const session = new ReplaySession(
      makeReplaySessionState({
        divergences: [{ step: 0, type: "screenshot_mismatch" }],
      }) as any
    );

    const result = await session.finish();

    expect(result.success).toBe(true);
    expect(result.replaySuccessRate).toBe(1);
  });

  it("shouldFailWhenBlockingDivergencesExist", async () => {
    const session = new ReplaySession(
      makeReplaySessionState({
        divergences: [{ step: 0, type: "network_digest_mismatch" }],
        matchedSteps: 0,
        timeToDivergence: 0,
      }) as any
    );

    const result = await session.finish();

    expect(result.success).toBe(false);
    expect(result.replaySuccessRate).toBe(0);
    expect(result.timeToDivergence).toBe(0);
  });

  it("shouldAdvanceStepBoundariesBetweenManualReplayActions", async () => {
    const setStepIndex = vi.fn();
    const getStepNetworkDigest = vi.fn((stepIndex: number) => `network-${stepIndex}`);
    const suspend = vi.fn().mockResolvedValue(undefined);

    captureDOMSnapshot
      .mockResolvedValueOnce({ hash: "dom-0" })
      .mockResolvedValueOnce({ hash: "dom-1" });
    captureAccessibilitySnapshot
      .mockResolvedValueOnce({ hash: "a11y-0" })
      .mockResolvedValueOnce({ hash: "a11y-1" });
    captureScreenshot
      .mockResolvedValueOnce({ hash: "screenshot-0" })
      .mockResolvedValueOnce({ hash: "screenshot-1" });

    const session = new ReplaySession(
      makeReplaySessionState({
        archive: {
          manifest: {
            steps: [makeStep(0), makeStep(1)],
          },
        },
        replayer: {
          setStepIndex,
          getStepNetworkDigest,
          getDivergencesForStep: vi.fn().mockReturnValue([]),
          getDivergences: vi.fn().mockReturnValue([]),
          stop: vi.fn().mockResolvedValue(undefined),
        },
        timeVirtualizer: {
          start: vi.fn().mockResolvedValue(undefined),
          pause: vi.fn().mockResolvedValue(undefined),
          waitForQuiescence: vi.fn().mockResolvedValue({ quiescent: true }),
          suspend,
          stop: vi.fn().mockResolvedValue(undefined),
        },
        timeVirtualizerStarted: false,
        stepIndex: 0,
        matchedSteps: 0,
      }) as any
    );

    const first = await session.step();
    const second = await session.step();
    const result = await session.finish();

    expect(first.matched).toBe(true);
    expect(second.matched).toBe(true);
    expect(result.success).toBe(true);
    expect(result.replaySuccessRate).toBe(1);
    expect(setStepIndex.mock.calls).toEqual([[0], [1], [1]]);
    expect(suspend).toHaveBeenCalledTimes(2);
    expect(setStepIndex.mock.invocationCallOrder[1]).toBeGreaterThan(
      suspend.mock.invocationCallOrder[0]!
    );
  });
});
