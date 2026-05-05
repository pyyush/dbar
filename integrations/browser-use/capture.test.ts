import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseArgs,
  parseStepSignal,
  cleanSignalFiles,
  waitForSignal,
  resolvePageForCapture,
  captureStepSnapshot,
  buildManifest,
  scrubUrlsInText,
  scrubUrlForLogs,
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
  const originalEnv = process.env.BROWSER_USE_CDP_URL;

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv === undefined) {
      delete process.env.BROWSER_USE_CDP_URL;
    } else {
      process.env.BROWSER_USE_CDP_URL = originalEnv;
    }
  });

  it("shouldTreatTheFirstArgumentAsOutputDir", () => {
    process.argv = ["node", "capture.ts", "/tmp/out"];
    process.env.BROWSER_USE_CDP_URL = "http://127.0.0.1:9333/";

    const args = parseArgs();

    expect(args.cdpUrl).toBe("http://127.0.0.1:9333/");
    expect(args.outputDir).toBe("/tmp/out");
  });

  it("shouldReadCdpUrlFromEnvironmentWhenArgIsMissing", () => {
    process.argv = ["node", "capture.ts", "/tmp/out"];
    process.env.BROWSER_USE_CDP_URL = "http://127.0.0.1:9444/";

    const args = parseArgs();

    expect(args.cdpUrl).toBe("http://127.0.0.1:9444/");
    expect(args.outputDir).toBe("/tmp/out");
  });

  it("shouldThrowWhenNoCdpUrlIsProvided", () => {
    process.argv = ["node", "capture.ts"];
    delete process.env.BROWSER_USE_CDP_URL;

    expect(() => parseArgs()).toThrow(/CDP URL is required/);
  });

  it("shouldNotAcceptRawCdpUrlsAsProcessArguments", () => {
    process.argv = ["node", "capture.ts", "http://127.0.0.1:9333/", "/tmp/out"];
    delete process.env.BROWSER_USE_CDP_URL;

    expect(() => parseArgs()).toThrow(/BROWSER_USE_CDP_URL/);
  });
});

describe("parseStepSignal", () => {
  it("shouldParsePlainTextLabels", () => {
    expect(parseStepSignal("step-4")).toEqual({ label: "step-4" });
  });

  it("shouldParseJsonPayloadsWithTargetId", () => {
    expect(parseStepSignal('{"label":"step-4","targetId":"target-123"}')).toEqual({
      label: "step-4",
      targetId: "target-123",
    });
  });

  it("shouldDefaultEmptyPayloadToStep", () => {
    expect(parseStepSignal("   ")).toEqual({ label: "step" });
  });
});

describe("cleanSignalFiles", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.unlinkSync).mockReset();
  });

  it("shouldRemoveExistingSignalFiles", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    cleanSignalFiles();

    expect(fs.unlinkSync).toHaveBeenCalledWith(".dbar-step");
    expect(fs.unlinkSync).toHaveBeenCalledWith(".dbar-finish");
  });

  it("shouldNotThrowWhenSignalFilesDoNotExist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

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
    let callCount = 0;
    vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      const current = String(path);
      if (current === ".dbar-finish") return false;
      if (current === ".dbar-step") {
        callCount++;
        return callCount >= 2;
      }
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('{"label":"step-1","targetId":"target-1"}');

    const promise = waitForSignal();
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toEqual({ type: "step", label: "step-1", targetId: "target-1" });
    expect(fs.unlinkSync).toHaveBeenCalledWith(".dbar-step");
  });

  it("shouldResolveWithFinishWhenFinishSignalAppears", async () => {
    vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      return String(path) === ".dbar-finish";
    });

    const promise = waitForSignal();
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;

    expect(result).toEqual({ type: "finish" });
  });
});

describe("resolvePageForCapture", () => {
  it("shouldMatchTheRequestedTargetId", async () => {
    const sessionA = {
      send: vi.fn().mockResolvedValue({ targetInfo: { targetId: "target-a" } }),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const sessionB = {
      send: vi.fn().mockResolvedValue({ targetInfo: { targetId: "target-b" } }),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const pageA = {
      url: () => "https://example.com/a",
      context: () => ({ newCDPSession: vi.fn().mockResolvedValue(sessionA) }),
    };
    const pageB = {
      url: () => "https://example.com/b",
      context: () => ({ newCDPSession: vi.fn().mockResolvedValue(sessionB) }),
    };
    const browser = {
      contexts: () => [{ pages: () => [pageA, pageB] }],
    };

    const resolved = await resolvePageForCapture(browser as never, "target-b");

    expect(resolved.page).toBe(pageB);
    expect(resolved.cdpSession).toBe(sessionB);
    expect(resolved.matchedTargetId).toBe(true);
    expect(sessionA.detach).toHaveBeenCalledTimes(1);
  });

  it("shouldFallbackToFirstAvailablePageWhenTargetIsMissing", async () => {
    const session = {
      send: vi.fn().mockResolvedValue({ targetInfo: { targetId: "target-a" } }),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      url: () => "https://example.com/a",
      context: () => ({ newCDPSession: vi.fn().mockResolvedValue(session) }),
    };
    const browser = {
      contexts: () => [{ pages: () => [page] }],
    };

    const resolved = await resolvePageForCapture(browser as never, "missing-target");

    expect(resolved.page).toBe(page);
    expect(resolved.cdpSession).toBe(session);
    expect(resolved.matchedTargetId).toBe(false);
  });
});

describe("captureStepSnapshot", () => {
  it("shouldCaptureDomA11yAndScreenshotWithHashes", async () => {
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

    const record = await captureStepSnapshot(mockCdp as never, "step-1", 1);

    expect(record.label).toBe("step-1");
    expect(record.stepNumber).toBe(1);
    expect(record.domHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.a11yHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.screenshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.timestamp).toBeDefined();
  });

  it("shouldProduceDeterministicHashesForSameInput", async () => {
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

    const first = await captureStepSnapshot(makeCdp() as never, "s1", 1);
    const second = await captureStepSnapshot(makeCdp() as never, "s1", 1);

    expect(first.domHash).toBe(second.domHash);
    expect(first.a11yHash).toBe(second.a11yHash);
    expect(first.screenshotHash).toBe(second.screenshotHash);
  });
});

describe("buildManifest", () => {
  it("shouldBuildManifestWithAllSteps", () => {
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

    const manifest = buildManifest(
      steps,
      "http://token-user:secret-pass@127.0.0.1:9333/json/version?token=secret#fragment",
    );

    expect(manifest.version).toBe("1.0.0");
    expect(manifest.cdpUrl).toBe("http://127.0.0.1:9333/json/version");
    expect(manifest.steps).toHaveLength(2);
    expect(manifest.steps[0]!.label).toBe("step-1");
    expect(manifest.steps[1]!.domHash).toBe("ddd");
    expect(manifest.captureMode).toBe("snapshot-only");
    expect(manifest.createdAt).toBeDefined();
  });

  it("shouldSetCaptureModeLimitations", () => {
    const manifest = buildManifest([], "http://127.0.0.1:9333/");

    expect(manifest.captureMode).toBe("snapshot-only");
    expect(manifest.limitations).toContain("no-network-recording");
    expect(manifest.limitations).toContain("no-virtual-time");
    expect(manifest.limitations).toContain("no-deterministic-replay");
  });
});

describe("scrubUrlForLogs", () => {
  it("shouldStripCredentialsQueryParamsAndFragments", () => {
    expect(
      scrubUrlForLogs("ws://user:pass@127.0.0.1:9222/devtools/browser/id?token=secret#debug"),
    ).toBe("ws://127.0.0.1:9222/devtools/browser/id");
  });

  it("shouldReturnAPlaceholderForMalformedUrls", () => {
    expect(scrubUrlForLogs("http://[not-a-url")).toBe("[redacted-url]");
  });
});

describe("scrubUrlsInText", () => {
  it("shouldScrubUrlsEmbeddedInErrorMessages", () => {
    const message = "connect ECONNREFUSED ws://user:pass@127.0.0.1:9222/devtools/browser/id?token=secret";

    expect(scrubUrlsInText(message)).toBe(
      "connect ECONNREFUSED ws://127.0.0.1:9222/devtools/browser/id",
    );
  });
});
