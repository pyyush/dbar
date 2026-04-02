/**
 * DBAR Snapshot Capture Sidecar for browser-use
 *
 * Connects to a running Chrome instance via CDP and captures page state
 * snapshots (DOM, accessibility tree, screenshot) at step boundaries
 * signaled by browser-use's on_step_end hook via the filesystem.
 *
 * This is a "snapshot-only" capture mode: it does NOT enable virtual time
 * or network interception, which would conflict with browser-use's own
 * CDP usage via cdp-use. For full deterministic capture and replay,
 * use DBAR directly with Playwright.
 *
 * Usage:
 *   npx tsx capture.ts [cdpUrl] [outputDir]
 *
 * Defaults:
 *   cdpUrl    = http://localhost:9222
 *   outputDir = ./dbar-snapshots
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

/**
 * Parse CLI arguments for the capture sidecar.
 *
 * @returns cdpUrl and outputDir parsed from process.argv, with defaults.
 */
export function parseArgs(): { cdpUrl: string; outputDir: string } {
  const cdpUrl = process.argv[2] ?? "http://localhost:9222";
  const outputDir = resolve(process.argv[3] ?? "./dbar-snapshots");
  return { cdpUrl, outputDir };
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
 *   - `{ type: "step", label: string }` when `.dbar-step` appears
 *   - `{ type: "finish" }` when `.dbar-finish` appears
 */
export function waitForSignal(): Promise<{ type: "step"; label: string } | { type: "finish" }> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (existsSync(FINISH_SIGNAL)) {
        clearInterval(interval);
        try { unlinkSync(FINISH_SIGNAL); } catch { /* already removed */ }
        resolve({ type: "finish" });
        return;
      }

      if (existsSync(STEP_SIGNAL)) {
        const raw = readFileSync(STEP_SIGNAL, "utf-8").trim();
        const label = raw || "step";
        try { unlinkSync(STEP_SIGNAL); } catch { /* already removed */ }
        clearInterval(interval);
        resolve({ type: "step", label });
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

/**
 * Capture DOM snapshot, accessibility tree, and screenshot at a step boundary
 * using raw CDP commands. Does not use DBAR's high-level capture API to avoid
 * enabling virtual time or Fetch interception.
 *
 * @param cdpSession - A CDP session (e.g., from Playwright's `page.createCDPSession()`)
 * @param label - Human-readable label for this step
 * @param stepNumber - Sequential step number
 * @returns A StepRecord with SHA-256 hashes for each artifact
 */
export async function captureStepSnapshot(
  cdpSession: { send: (method: string, params?: Record<string, unknown>) => Promise<unknown> },
  label: string,
  stepNumber: number,
): Promise<StepRecord> {
  // DOM snapshot via CDP
  await cdpSession.send("DOMSnapshot.enable");
  const domSnapshot = await cdpSession.send("DOMSnapshot.captureSnapshot", {
    computedStyles: ["display", "visibility", "opacity", "position"],
    includePaintOrder: false,
    includeDOMRects: true,
  });
  const domSerialized = canonicalize(domSnapshot);
  const domHash = createHash("sha256").update(domSerialized).digest("hex");

  // Accessibility tree via CDP (not Playwright's page.accessibility)
  const a11yTree = await cdpSession.send("Accessibility.getFullAXTree");
  const a11ySerialized = canonicalize(a11yTree);
  const a11yHash = createHash("sha256").update(a11ySerialized).digest("hex");

  // Screenshot via CDP Page.captureScreenshot
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
  // Dynamic import to avoid requiring playwright-core at test time
  const { chromium } = await import("playwright-core");

  const { cdpUrl, outputDir } = parseArgs();

  console.log(`[dbar-capture] Connecting to browser at ${cdpUrl}`);

  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    console.error("[dbar-capture] No browser contexts found. Is a page open?");
    process.exit(1);
  }

  const context = contexts[0]!;
  const pages = context.pages();

  if (pages.length === 0) {
    console.error("[dbar-capture] No pages found in the browser context.");
    process.exit(1);
  }

  const page = pages[0]!;
  console.log(`[dbar-capture] Attached to page: ${page.url()}`);

  const cdpSession = await page.context().newCDPSession(page);

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

      try {
        // Capture snapshots via CDP
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
      }
    } else {
      console.log("[dbar-capture] Finish signal received.");
      running = false;
    }
  }

  const manifestPath = writeArtifacts(outputDir, steps, artifacts, cdpUrl);
  console.log(`[dbar-capture] Manifest written to: ${manifestPath}`);
  console.log(`[dbar-capture] Steps captured: ${steps.length}`);

  await cdpSession.detach();
  await browser.close();
  process.exitCode = 0;
}
