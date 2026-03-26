/**
 * DBAR Capture Bridge for browser-use
 *
 * Connects to a running browser via CDP and records a determinism capsule.
 * Designed to run alongside a browser-use agent session.
 *
 * Usage:
 *   node --loader ts-node/esm capture.ts [cdpUrl] [outputDir]
 *
 * Defaults:
 *   cdpUrl    = http://localhost:9222
 *   outputDir = ./capsules
 *
 * Signaling (file-based):
 *   Write to `.dbar-step` to trigger a step capture (file content = step label).
 *   Write to `.dbar-finish` to end the session and produce the capsule.
 *
 * @module
 */

import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";
import type { CaptureSession } from "@pyyush/dbar";
import type { CapsuleArchive } from "@pyyush/dbar";

const STEP_SIGNAL = ".dbar-step";
const FINISH_SIGNAL = ".dbar-finish";
const POLL_INTERVAL_MS = 250;

/** Parse CLI arguments with defaults. */
function parseArgs(): { cdpUrl: string; outputDir: string } {
  const cdpUrl = process.argv[2] ?? "http://localhost:9222";
  const outputDir = resolve(process.argv[3] ?? "./capsules");
  return { cdpUrl, outputDir };
}

/** Remove stale signal files from a previous run. */
function cleanSignalFiles(): void {
  for (const signal of [STEP_SIGNAL, FINISH_SIGNAL]) {
    if (existsSync(signal)) {
      unlinkSync(signal);
    }
  }
}

/**
 * Poll the filesystem for signal files. Returns a promise that resolves
 * when either a step or finish signal is detected.
 */
function waitForSignal(): Promise<{ type: "step"; label: string } | { type: "finish" }> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (existsSync(FINISH_SIGNAL)) {
        clearInterval(interval);
        try { unlinkSync(FINISH_SIGNAL); } catch { /* already removed */ }
        resolve({ type: "finish" });
        return;
      }

      if (existsSync(STEP_SIGNAL)) {
        const label = readFileSync(STEP_SIGNAL, "utf-8").trim() || `step`;
        try { unlinkSync(STEP_SIGNAL); } catch { /* already removed */ }
        clearInterval(interval);
        resolve({ type: "step", label });
      }
    }, POLL_INTERVAL_MS);
  });
}

/** Write a capsule archive to disk as a JSON file. Returns the output path. */
function writeCapsule(archive: CapsuleArchive, outputDir: string): string {
  mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `capsule-${timestamp}.json`;
  const outputPath = join(outputDir, filename);

  const serialized = serializeCapsuleArchive(archive);
  writeFileSync(outputPath, serialized, "utf-8");

  return outputPath;
}

async function main(): Promise<void> {
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

  cleanSignalFiles();

  console.log("[dbar-capture] Starting capture session...");
  const session: CaptureSession = await DBAR.capture(page);
  console.log(`[dbar-capture] Session ${session.id} started. Waiting for signals...`);
  console.log(`[dbar-capture]   Write to '${STEP_SIGNAL}' to capture a step (content = label)`);
  console.log(`[dbar-capture]   Write to '${FINISH_SIGNAL}' to finish and produce capsule`);

  // Signal loop: process steps until finish is received.
  let running = true;
  while (running) {
    const signal = await waitForSignal();

    if (signal.type === "step") {
      console.log(`[dbar-capture] Step signal received: "${signal.label}"`);
      const snapshot = await session.step(signal.label);
      console.log(`[dbar-capture] Step ${session.stepCount} captured (observables hashed)`);
    } else {
      console.log("[dbar-capture] Finish signal received. Finalizing capsule...");
      running = false;
    }
  }

  const archive = await session.finish();
  const outputPath = writeCapsule(archive, outputDir);

  console.log(`[dbar-capture] Capsule written to: ${outputPath}`);
  console.log(`[dbar-capture] Steps: ${archive.manifest.steps.length}, Requests: ${archive.manifest.networkTranscript.entries.length}`);

  await browser.close();
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("[dbar-capture] Fatal error:", error);
  process.exit(1);
});
