import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readFile = vi.hoisted(() => vi.fn());
const deserializeCapsuleArchive = vi.hoisted(() => vi.fn());
const replay = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  readFile,
}));

vi.mock("../capsule/builder.js", () => ({
  deserializeCapsuleArchive,
}));

vi.mock("../sdk.js", () => ({
  DBAR: {
    replay,
  },
}));

vi.mock("playwright-core", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({}),
      close,
    }),
  },
}));

import { runReplay } from "../cli/replay.js";

const archive = {
  manifest: {
    steps: [{ index: 0 }, { index: 1 }],
    networkTranscript: { entries: [] },
  },
  files: new Map(),
};

describe("runReplay", () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    readFile.mockResolvedValue("capsule-data");
    deserializeCapsuleArchive.mockReturnValue(archive);
    close.mockResolvedValue(undefined);
    stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
  });

  it("shouldPrintFirstDivergenceAndSetExitCodeForBlockingFailures", async () => {
    replay.mockResolvedValue({
      success: false,
      replaySuccessRate: 0.5,
      determinismViolationRate: 0.5,
      timeToDivergence: 1,
      divergences: [
        { step: 0, type: "screenshot_mismatch", details: "advisory" },
        { step: 1, type: "network_digest_mismatch" },
      ],
      overheadMs: 250,
    });

    await runReplay("fixtures/failed.capsule", {});

    expect(process.exitCode).toBe(1);
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining("First blocking divergence: step 1 (network_digest_mismatch)"));
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining("Blocking:    1 failed step"));
  });

  it("shouldChooseTheEarliestDivergenceForJsonOutput", async () => {
    replay.mockResolvedValue({
      success: false,
      replaySuccessRate: 0,
      determinismViolationRate: 1,
      timeToDivergence: 0,
      divergences: [
        { step: 2, type: "dom_mismatch" },
        { step: 0, type: "network_digest_mismatch" },
      ],
      overheadMs: 100,
    });

    await runReplay("fixtures/failed.capsule", { json: true });

    const output = stdoutWrite.mock.calls[0]?.[0];
    expect(typeof output).toBe("string");
    const parsed = JSON.parse(String(output));
    expect(parsed.firstDivergence).toEqual({
      step: 0,
      type: "network_digest_mismatch",
    });
    expect(parsed.replaySuccessRate).toBe(0);
    expect(parsed.determinismViolationRate).toBe(1);
    expect(parsed.timeToDivergence).toBe(0);
  });

  it("shouldExposeFirstDivergenceMetadataInJsonOutput", async () => {
    replay.mockResolvedValue({
      success: true,
      replaySuccessRate: 1,
      determinismViolationRate: 0,
      timeToDivergence: undefined,
      divergences: [{ step: 0, type: "screenshot_mismatch", details: "advisory" }],
      overheadMs: 100,
    });

    await runReplay("fixtures/advisory.capsule", { json: true });

    expect(process.exitCode).toBeUndefined();
    const output = stdoutWrite.mock.calls[0]?.[0];
    expect(typeof output).toBe("string");
    const parsed = JSON.parse(String(output));
    expect(parsed.failedStepCount).toBe(0);
    expect(parsed.firstDivergence).toEqual({
      step: 0,
      type: "screenshot_mismatch",
      details: "advisory",
    });
    expect(parsed.firstBlockingDivergence).toBeNull();
    expect(parsed.timeToDivergence).toBeNull();
  });
});
