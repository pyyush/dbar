import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  parseArgs,
  cleanSignalFiles,
  waitForSignal,
  captureStepSnapshot,
  buildManifest,
  type StepRecord,
} from "./capture.js";
import * as fs from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe("parseArgs", () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("shouldUseDefaultsWhenNoArgsProvided", () => {
    // Given no CLI arguments beyond node and script
    process.argv = ["node", "capture.ts"];

    // When parsing args
    const args = parseArgs();

    // Then defaults are used
    expect(args.cdpUrl).toBe("http://localhost:9222");
    expect(args.outputDir).toContain("dbar-snapshots");
  });

  it("shouldParseCustomCdpUrlAndOutputDir", () => {
    // Given custom CLI arguments
    process.argv = ["node", "capture.ts", "http://localhost:9333", "/tmp/out"];

    // When parsing args
    const args = parseArgs();

    // Then custom values are used
    expect(args.cdpUrl).toBe("http://localhost:9333");
    expect(args.outputDir).toBe("/tmp/out");
  });
});

describe("cleanSignalFiles", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.unlinkSync).mockReset();
  });

  it("shouldRemoveExistingSignalFiles", () => {
    // Given both signal files exist
    vi.mocked(fs.existsSync).mockReturnValue(true);

    // When cleaning
    cleanSignalFiles();

    // Then both are removed
    expect(fs.unlinkSync).toHaveBeenCalledWith(".dbar-step");
    expect(fs.unlinkSync).toHaveBeenCalledWith(".dbar-finish");
  });

  it("shouldNotThrowWhenSignalFilesDoNotExist", () => {
    // Given no signal files exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // When cleaning
    // Then it does not throw
    expect(() => cleanSignalFiles()).not.toThrow();
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe("waitForSignal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.unlinkSync).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shouldResolveWithStepWhenStepSignalAppears", async () => {
    // Given step signal appears on the second poll
    let callCount = 0;
    vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      const p = String(path);
      if (p === ".dbar-finish") return false;
      if (p === ".dbar-step") {
        callCount++;
        return callCount >= 2;
      }
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue("step-1");

    // When waiting for a signal
    const promise = waitForSignal();
    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;

    // Then it resolves with step type and the label
    expect(result).toEqual({ type: "step", label: "step-1" });
    expect(fs.unlinkSync).toHaveBeenCalledWith(".dbar-step");
  });

  it("shouldResolveWithFinishWhenFinishSignalAppears", async () => {
    // Given finish signal appears on the first poll
    vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      return String(path) === ".dbar-finish";
    });

    // When waiting
    const promise = waitForSignal();
    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;

    // Then it resolves with finish type
    expect(result).toEqual({ type: "finish" });
  });

  it("shouldUseDefaultLabelWhenStepFileIsEmpty", async () => {
    // Given step signal with empty content
    vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      if (String(path) === ".dbar-finish") return false;
      return String(path) === ".dbar-step";
    });
    vi.mocked(fs.readFileSync).mockReturnValue("  ");

    // When waiting
    const promise = waitForSignal();
    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;

    // Then label defaults to "step"
    expect(result).toEqual({ type: "step", label: "step" });
  });
});

describe("captureStepSnapshot", () => {
  it("shouldCaptureDomA11yAndScreenshotWithHashes", async () => {
    // Given mock CDP session and Page
    const domData = { documents: [], strings: [] };
    const mockCdp = {
      send: vi.fn().mockImplementation((method: string) => {
        if (method === "DOMSnapshot.enable") return Promise.resolve();
        if (method === "DOMSnapshot.captureSnapshot") return Promise.resolve(domData);
        if (method === "Accessibility.getFullAXTree") {
          return Promise.resolve({ nodes: [{ role: { value: "WebArea" } }] });
        }
        if (method === "Page.captureScreenshot") {
          return Promise.resolve({ data: Buffer.from("fake-png").toString("base64") });
        }
        return Promise.resolve();
      }),
    };

    // When capturing a step snapshot
    const record = await captureStepSnapshot(mockCdp as any, "step-1", 1);

    // Then it returns a StepRecord with all three snapshots hashed
    expect(record.label).toBe("step-1");
    expect(record.stepNumber).toBe(1);
    expect(record.domHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.a11yHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.screenshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.timestamp).toBeDefined();
  });

  it("shouldProduceDeterministicHashesForSameInput", async () => {
    // Given two identical CDP responses
    const domData = { documents: [{ nodes: [1] }], strings: ["a"] };
    const a11yData = { nodes: [{ role: { value: "button" } }] };
    const screenshotBase64 = Buffer.from("same-png").toString("base64");

    const makeCdp = () => ({
      send: vi.fn().mockImplementation((method: string) => {
        if (method === "DOMSnapshot.enable") return Promise.resolve();
        if (method === "DOMSnapshot.captureSnapshot") return Promise.resolve(domData);
        if (method === "Accessibility.getFullAXTree") return Promise.resolve(a11yData);
        if (method === "Page.captureScreenshot") return Promise.resolve({ data: screenshotBase64 });
        return Promise.resolve();
      }),
    });

    // When capturing twice
    const r1 = await captureStepSnapshot(makeCdp() as any, "s1", 1);
    const r2 = await captureStepSnapshot(makeCdp() as any, "s1", 1);

    // Then hashes are identical
    expect(r1.domHash).toBe(r2.domHash);
    expect(r1.a11yHash).toBe(r2.a11yHash);
    expect(r1.screenshotHash).toBe(r2.screenshotHash);
  });
});

describe("buildManifest", () => {
  it("shouldBuildManifestWithAllSteps", () => {
    // Given step records
    const steps: StepRecord[] = [
      {
        label: "step-1",
        stepNumber: 1,
        timestamp: "2026-03-26T00:00:00.000Z",
        domHash: "aaa",
        a11yHash: "bbb",
        screenshotHash: "ccc",
      },
      {
        label: "step-2",
        stepNumber: 2,
        timestamp: "2026-03-26T00:00:01.000Z",
        domHash: "ddd",
        a11yHash: "eee",
        screenshotHash: "fff",
      },
    ];

    // When building manifest
    const manifest = buildManifest(steps, "http://localhost:9222");

    // Then it contains all steps and metadata
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.cdpUrl).toBe("http://localhost:9222");
    expect(manifest.steps).toHaveLength(2);
    expect(manifest.steps[0]!.label).toBe("step-1");
    expect(manifest.steps[1]!.domHash).toBe("ddd");
    expect(manifest.captureMode).toBe("snapshot-only");
    expect(manifest.createdAt).toBeDefined();
  });

  it("shouldSetCaptureModeLimitations", () => {
    // Given empty steps
    const manifest = buildManifest([], "http://localhost:9222");

    // Then manifest documents limitations
    expect(manifest.captureMode).toBe("snapshot-only");
    expect(manifest.limitations).toContain("no-network-recording");
    expect(manifest.limitations).toContain("no-virtual-time");
    expect(manifest.limitations).toContain("no-deterministic-replay");
  });
});
