/**
 * DBAR Local Replay for Browserbase Capsules
 *
 * Replays a capsule recorded via Browserbase on a LOCAL browser.
 * This is the value prop: "record in cloud, verify locally."
 *
 * No Browserbase credentials or connection needed — replay is fully local.
 *
 * Usage:
 *   npx tsx replay.ts <capsule-path> [--json]
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

import { parseReplayArgs } from "./helpers.js";

async function main(): Promise<void> {
  const args = parseReplayArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`[dbar-replay] Error: ${args.error}`);
    console.error("[dbar-replay] Usage: npx tsx replay.ts <capsule-path> [--json]");
    process.exit(2);
  }

  const capsulePath = resolve(args.capsulePath!);
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
  console.error(
    `[dbar-replay] Steps: ${manifest.steps.length}, ` +
    `Requests: ${manifest.networkTranscript.entries.length}`
  );

  console.error("[dbar-replay] Launching local browser for replay...");
  const noSandbox = process.env["DBAR_NO_SANDBOX"] === "1";
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-gpu",
      ...(noSandbox ? ["--no-sandbox"] : []),
    ],
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

  if (args.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log(`[dbar-replay] Replay complete.`);
    console.log(`[dbar-replay]   Success: ${result.success}`);
    console.log(`[dbar-replay]   RSR: ${(result.replaySuccessRate * 100).toFixed(1)}%`);
    console.log(`[dbar-replay]   DVR: ${(result.determinismViolationRate * 100).toFixed(1)}%`);
    console.log(`[dbar-replay]   Divergences: ${result.divergences.length}`);
    console.log(`[dbar-replay]   Overhead: ${result.overheadMs}ms`);

    if (result.timeToDivergence !== undefined) {
      console.log(`[dbar-replay]   First divergence at step: ${result.timeToDivergence}`);
    }
  }

  await browser.close();

  process.exit(result.success ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("[dbar-replay] Fatal error:", error);
  process.exit(2);
});
