/**
 * DBAR Replay Script for browser-use capsules
 *
 * Takes a capsule file, launches a fresh browser, replays the session,
 * and outputs the ReplayResult as JSON to stdout.
 *
 * Usage:
 *   node --loader ts-node/esm replay.ts <capsule-path>
 *
 * Exit codes:
 *   0 = replay succeeded (all steps matched)
 *   1 = replay completed with divergences
 *   2 = fatal error (missing file, bad capsule, etc.)
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { DBAR, deserializeCapsuleArchive } from "@pyyush/dbar";

function parseArgs(): { capsulePath: string } {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: replay.ts <capsule-path>");
    console.error("  capsule-path: Path to a capsule JSON file produced by capture.ts");
    process.exit(2);
  }
  return { capsulePath: resolve(raw) };
}

async function main(): Promise<void> {
  const { capsulePath } = parseArgs();

  console.error(`[dbar-replay] Loading capsule from: ${capsulePath}`);

  let serialized: string;
  try {
    serialized = readFileSync(capsulePath, "utf-8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dbar-replay] Failed to read capsule file: ${message}`);
    process.exit(2);
  }

  const archive = deserializeCapsuleArchive(serialized);
  const manifest = archive.manifest;

  console.error(`[dbar-replay] Capsule ID: ${manifest.id}`);
  console.error(`[dbar-replay] Steps: ${manifest.steps.length}, Requests: ${manifest.networkTranscript.entries.length}`);

  console.error("[dbar-replay] Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", ...(process.env["DBAR_NO_SANDBOX"] === "1" ? ["--no-sandbox"] : [])],
  });

  const context = await browser.newContext({
    viewport: {
      width: manifest.environment.viewport.width,
      height: manifest.environment.viewport.height,
    },
    locale: manifest.environment.locale,
    timezoneId: manifest.environment.timezone,
    userAgent: manifest.environment.userAgent,
  });

  const page = await context.newPage();

  console.error("[dbar-replay] Starting replay...");
  const result = await DBAR.replay(page, archive);

  // Output the structured result to stdout (stdout is reserved for machine-readable output).
  const output = JSON.stringify(result, null, 2);
  process.stdout.write(output + "\n");

  // Human-readable summary on stderr.
  console.error(`[dbar-replay] Replay complete.`);
  console.error(`[dbar-replay]   Success: ${result.success}`);
  console.error(`[dbar-replay]   RSR: ${(result.replaySuccessRate * 100).toFixed(1)}%`);
  console.error(`[dbar-replay]   DVR: ${(result.determinismViolationRate * 100).toFixed(1)}%`);
  console.error(`[dbar-replay]   Divergences: ${result.divergences.length}`);
  console.error(`[dbar-replay]   Overhead: ${result.overheadMs}ms`);

  if (result.timeToDivergence !== undefined) {
    console.error(`[dbar-replay]   First divergence at step: ${result.timeToDivergence}`);
  }

  await browser.close();

  process.exit(result.success ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("[dbar-replay] Fatal error:", error);
  process.exit(2);
});
