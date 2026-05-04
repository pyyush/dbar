/**
 * DBAR snapshot capture sidecar for browser-use.
 *
 * Connects to a running Chrome instance via CDP and captures page state
 * snapshots (DOM, accessibility tree, screenshot) at step boundaries
 * signaled by browser-use's on_step_end hook via the filesystem.
 *
 * This is a snapshot-only capture mode: it does not enable virtual time
 * or network interception, which would conflict with browser-use's own
 * CDP usage via cdp-use. For full deterministic capture and replay,
 * use DBAR directly with Playwright.
 *
 * Usage:
 *   npx tsx capture.ts <cdpUrl> [outputDir]
 *   BROWSER_USE_CDP_URL=<cdpUrl> npx tsx capture.ts [outputDir]
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const STEP_SIGNAL = ".dbar-step";
const FINISH_SIGNAL = ".dbar-finish";
const POLL_INTERVAL_MS = 250;

/** A record of captured snapshot data for a single step. */
export interface StepRecord {
  label: string;
  stepNumber: number;
  timestamp: string;
  domHash: string;
  a11yHash: string;
  screenshotHash: string;
}

/** Manifest written at the end of a capture session. */
export interface CaptureManifest {
  version: string;
  cdpUrl: string;
  captureMode: string;
  limitations: string[];
  createdAt: string;
  steps: StepRecord[];
}

/** Parsed step-signal payload written by the Python hook. */
export interface StepSignalPayload {
  label: string;
  targetId?: string;
}

/** Signal variants consumed by the capture loop. */
export type CaptureSignal = { type: "step"; label: string; targetId?: string } | { type: "finish" };

/**
 * Parse CLI arguments for the capture sidecar.
 *
 * @returns cdpUrl and outputDir parsed from process.argv / environment.
 */
export function parseArgs(): { cdpUrl: string; outputDir: string } {
  const argv = process.argv.slice(2);
  const envCdpUrl = process.env.BROWSER_USE_CDP_URL;

  let cdpUrl = envCdpUrl;
  let outputDirArg = argv[0];

  if (argv[0]?.startsWith("http://") || argv[0]?.startsWith("https://") || argv[0]?.startsWith("ws://") || argv[0]?.startsWith("wss://")) {
    cdpUrl = argv[0];
    outputDirArg = argv[1];
  }

  if (!cdpUrl) {
    throw new Error(
      "CDP URL is required. Pass it as the first argument or set BROWSER_USE_CDP_URL.",
    );
  }

  const outputDir = resolve(outputDirArg ?? "./dbar-snapshots");
  return { cdpUrl, outputDir };
}

/**
 * Parse a `.dbar-step` payload.
 *
 * Accepts either:
 * - plain text labels, e.g. `step-3`
 * - JSON payloads, e.g. `{\"label\":\"step-3\",\"targetId\":\"...\"}`
 */
export function parseStepSignal(raw: string): StepSignalPayload {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { label: "step" };
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      const label = typeof parsed.label === "string" && parsed.label.trim() !== ""
        ? parsed.label.trim()
        : "step";
      const targetId = typeof parsed.targetId === "string" && parsed.targetId.trim() !== ""
        ? parsed.targetId.trim()
        : undefined;
      return { label, targetId };
    }
  } catch {
    // Fall through to plain-text label mode.
  }

  return { label: trimmed };
}

/**
 * Remove stale signal files from a previous run.
 * Safe to call when files do not exist.
 */
export function cleanSignalFiles(): void {
  for (const signal of [STEP_SIGNAL, FINISH_SIGNAL]) {
    if (existsSync(signal)) {
      unlinkSync(signal);
    }
  }
}

/**
 * Poll the filesystem for step or finish signal files.
 *
 * @returns A promise that resolves when a signal is detected.
 */
export function waitForSignal(): Promise<CaptureSignal> {
  return new Promise((resolveSignal) => {
    const interval = setInterval(() => {
      if (existsSync(FINISH_SIGNAL)) {
        clearInterval(interval);
        try {
          unlinkSync(FINISH_SIGNAL);
        } catch {
          // already removed
        }
        resolveSignal({ type: "finish" });
        return;
      }

      if (existsSync(STEP_SIGNAL)) {
        const raw = readFileSync(STEP_SIGNAL, "utf-8");
        const parsed = parseStepSignal(raw);
        try {
          unlinkSync(STEP_SIGNAL);
        } catch {
          // already removed
        }
        clearInterval(interval);
        resolveSignal({ type: "step", ...parsed });
      }
    }, POLL_INTERVAL_MS);
  });
}

/**
 * Canonicalize a value to a deterministic JSON string with sorted keys.
 * Arrays preserve element order; only object key order is normalized.
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

type CDPSessionLike = {
  send: (...args: any[]) => Promise<any>;
  detach: () => Promise<void>;
};

type PageLike = {
  url: () => string;
  context: () => {
    newCDPSession: (page: any) => Promise<CDPSessionLike>;
  };
};

type BrowserLike = {
  contexts: () => Array<{
    pages: () => PageLike[];
  }>;
};

/**
 * Resolve the page that browser-use currently has focused.
 *
 * The Python hook can pass the current browser-use `agent_focus_target_id`.
 * We resolve that target per step so tab switches do not silently capture the
 * wrong page.
 */
export async function resolvePageForCapture(
  browser: BrowserLike,
  targetId?: string,
): Promise<{ page: PageLike; cdpSession: CDPSessionLike; matchedTargetId: boolean }> {
  const pages = browser.contexts().flatMap((context) => context.pages());
  if (pages.length === 0) {
    throw new Error("No pages found in the browser context.");
  }

  if (!targetId) {
    const page = pages[0]!;
    return {
      page,
      cdpSession: await page.context().newCDPSession(page),
      matchedTargetId: false,
    };
  }

  let fallback: { page: PageLike; cdpSession: CDPSessionLike } | undefined;

  for (const page of pages) {
    const cdpSession = await page.context().newCDPSession(page);
    try {
      const targetInfo = await cdpSession.send("Target.getTargetInfo") as {
        targetInfo?: { targetId?: string };
      };
      if (targetInfo.targetInfo?.targetId === targetId) {
        if (fallback) {
          await fallback.cdpSession.detach().catch(() => {});
        }
        return { page, cdpSession, matchedTargetId: true };
      }
    } catch {
      // Fall back below if we cannot resolve the target id.
    }

    if (!fallback) {
      fallback = { page, cdpSession };
    } else {
      await cdpSession.detach().catch(() => {});
    }
  }

  if (fallback) {
    return { ...fallback, matchedTargetId: false };
  }

  throw new Error(`Unable to resolve a page for target ${targetId}`);
}

/**
 * Capture DOM snapshot, accessibility tree, and screenshot at a step boundary
 * using raw CDP commands. Does not use DBAR's high-level capture API to avoid
 * enabling virtual time or Fetch interception.
 *
 * @param cdpSession - A CDP session for the current page target
 * @param label - Human-readable label for this step
 * @param stepNumber - Sequential step number
 * @returns A StepRecord with SHA-256 hashes for each artifact
 */
export async function captureStepSnapshot(
  cdpSession: { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> },
  label: string,
  stepNumber: number,
): Promise<StepRecord> {
  await cdpSession.send("DOMSnapshot.enable");
  const domSnapshot = await cdpSession.send("DOMSnapshot.captureSnapshot", {
    computedStyles: ["display", "visibility", "opacity", "position"],
    includePaintOrder: false,
    includeDOMRects: true,
  });
  const domSerialized = canonicalize(domSnapshot);
  const domHash = createHash("sha256").update(domSerialized).digest("hex");

  const a11yTree = await cdpSession.send("Accessibility.getFullAXTree");
  const a11ySerialized = canonicalize(a11yTree);
  const a11yHash = createHash("sha256").update(a11ySerialized).digest("hex");

  const screenshotResult = await cdpSession.send("Page.captureScreenshot", {
    format: "png",
  }) as { data: string };
  const screenshotBuffer = Buffer.from(screenshotResult.data, "base64");
  const screenshotHash = createHash("sha256").update(screenshotBuffer).digest("hex");

  return {
    label,
    stepNumber,
    timestamp: new Date().toISOString(),
    domHash,
    a11yHash,
    screenshotHash,
  };
}

/**
 * Build a capture manifest from collected step records.
 *
 * @param steps - All captured step records
 * @param cdpUrl - The CDP URL used for the session
 * @returns A CaptureManifest documenting the session
 */
export function buildManifest(steps: StepRecord[], cdpUrl: string): CaptureManifest {
  return {
    version: "1.0.0",
    cdpUrl,
    captureMode: "snapshot-only",
    limitations: [
      "no-network-recording",
      "no-virtual-time",
      "no-deterministic-replay",
    ],
    createdAt: new Date().toISOString(),
    steps,
  };
}

/**
 * Write step artifacts (DOM JSON, a11y JSON, screenshot PNG) and manifest
 * to the output directory.
 */
function writeArtifacts(
  outputDir: string,
  steps: StepRecord[],
  artifacts: Map<number, { dom: string; a11y: string; screenshot: Buffer }>,
  cdpUrl: string,
): string {
  mkdirSync(outputDir, { recursive: true });

  for (const [stepNum, data] of artifacts) {
    const stepDir = join(outputDir, `step-${String(stepNum).padStart(3, "0")}`);
    mkdirSync(stepDir, { recursive: true });
    writeFileSync(join(stepDir, "dom.json"), data.dom, "utf-8");
    writeFileSync(join(stepDir, "a11y.json"), data.a11y, "utf-8");
    writeFileSync(join(stepDir, "screenshot.png"), data.screenshot);
  }

  const manifest = buildManifest(steps, cdpUrl);
  const manifestPath = join(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return manifestPath;
}

// -- CLI entrypoint --
// Only runs when executed directly, not when imported for testing.

const isMainModule = process.argv[1]?.endsWith("capture.ts") ||
  process.argv[1]?.endsWith("capture.js");

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error("[dbar-capture] Fatal error:", error);
    process.exit(1);
  });
}

async function main(): Promise<void> {
  const { chromium } = await import("playwright-core");

  const { cdpUrl, outputDir } = parseArgs();

  console.log(`[dbar-capture] Connecting to browser at ${cdpUrl}`);

  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error("[dbar-capture] No browser contexts found. Is a page open?");
    process.exit(1);
  }

  cleanSignalFiles();

  console.log("[dbar-capture] Ready. Waiting for signals...");
  console.log(`[dbar-capture]   Write to '${STEP_SIGNAL}' to capture a step`);
  console.log(`[dbar-capture]   Write to '${FINISH_SIGNAL}' to finish`);

  const steps: StepRecord[] = [];
  const artifacts = new Map<number, { dom: string; a11y: string; screenshot: Buffer }>();
  let stepCount = 0;

  let running = true;
  while (running) {
    const signal = await waitForSignal();

    if (signal.type === "step") {
      stepCount++;
      console.log(`[dbar-capture] Step signal: "${signal.label}" (#${stepCount})`);

      let cdpSession: CDPSessionLike | undefined;

      try {
        const resolved = await resolvePageForCapture(browser, signal.targetId);
        cdpSession = resolved.cdpSession;

        if (signal.targetId && !resolved.matchedTargetId) {
          console.warn(
            `[dbar-capture] Target ${signal.targetId} not found, falling back to page ${resolved.page.url()}`,
          );
        } else {
          console.log(`[dbar-capture] Capturing page: ${resolved.page.url()}`);
        }

        await cdpSession.send("DOMSnapshot.enable" as any);
        const domSnapshot = await cdpSession.send(
          "DOMSnapshot.captureSnapshot" as any,
          {
            computedStyles: ["display", "visibility", "opacity", "position"],
            includePaintOrder: false,
            includeDOMRects: true,
          } as any,
        );
        const domSerialized = canonicalize(domSnapshot);

        const a11yTree = await cdpSession.send("Accessibility.getFullAXTree" as any);
        const a11ySerialized = canonicalize(a11yTree);

        const screenshotResult = await cdpSession.send(
          "Page.captureScreenshot" as any,
          { format: "png" } as any,
        ) as { data: string };
        const screenshotBuffer = Buffer.from(screenshotResult.data, "base64");

        const record: StepRecord = {
          label: signal.label,
          stepNumber: stepCount,
          timestamp: new Date().toISOString(),
          domHash: createHash("sha256").update(domSerialized).digest("hex"),
          a11yHash: createHash("sha256").update(a11ySerialized).digest("hex"),
          screenshotHash: createHash("sha256").update(screenshotBuffer).digest("hex"),
        };

        steps.push(record);
        artifacts.set(stepCount, {
          dom: domSerialized,
          a11y: a11ySerialized,
          screenshot: screenshotBuffer,
        });

        console.log(`[dbar-capture] Step ${stepCount} captured`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[dbar-capture] Failed to capture step ${stepCount}: ${message}`);
      } finally {
        if (cdpSession) {
          await cdpSession.detach().catch(() => {});
        }
      }
    } else {
      console.log("[dbar-capture] Finish signal received.");
      running = false;
    }
  }

  const manifestPath = writeArtifacts(outputDir, steps, artifacts, cdpUrl);
  console.log(`[dbar-capture] Manifest written to: ${manifestPath}`);
  console.log(`[dbar-capture] Steps captured: ${steps.length}`);

  await browser.close();
  process.exitCode = 0;
}
