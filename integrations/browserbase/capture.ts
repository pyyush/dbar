/**
 * DBAR Capture via Browserbase SDK
 *
 * Creates a Browserbase cloud browser session, connects DBAR via CDP, and
 * records a determinism capsule with full virtual time + network recording.
 *
 * Unlike the browser-use integration (where DBAR is a sidecar), here DBAR
 * OWNS the browser session — so full deterministic capture is possible.
 *
 * Usage:
 *   npx tsx capture.ts --url <url> [--steps <n>] [--output <path>]
 *
 * Auth: BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID env vars (no CLI flags for secrets).
 *
 * @module
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";

import { maskConnectUrl, parseCaptureArgs } from "./helpers.js";

/**
 * Patch page.accessibility for modern Playwright versions where the
 * property was removed in favor of page.accessibility being undefined.
 * DBAR's accessibility snapshot uses this internally.
 */
function patchAccessibility(page: import("playwright-core").Page): void {
  if (!page.accessibility) {
    Object.defineProperty(page, "accessibility", {
      value: {
        async snapshot() {
          return page.evaluate(() => {
            // Fallback: return minimal tree so DBAR can still hash something
            return { role: "WebArea", name: document.title, children: [] };
          });
        },
      },
    });
  }
}

async function main(): Promise<void> {
  const args = parseCaptureArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`[dbar-capture] Error: ${args.error}`);
    console.error("[dbar-capture] Usage: npx tsx capture.ts --url <url> [--steps <n>] [--output <path>]");
    process.exit(1);
  }

  const apiKey = process.env["BROWSERBASE_API_KEY"];
  const projectId = process.env["BROWSERBASE_PROJECT_ID"];

  if (!apiKey) {
    console.error("[dbar-capture] Missing BROWSERBASE_API_KEY environment variable.");
    console.error("[dbar-capture] Set it with: export BROWSERBASE_API_KEY=<your-key>");
    process.exit(1);
  }

  if (!projectId) {
    console.error("[dbar-capture] Missing BROWSERBASE_PROJECT_ID environment variable.");
    console.error("[dbar-capture] Set it with: export BROWSERBASE_PROJECT_ID=<your-id>");
    process.exit(1);
  }

  const bb = new Browserbase({ apiKey });

  console.log("[dbar-capture] Creating Browserbase session...");
  const session = await bb.sessions.create({
    projectId,
    browserSettings: {
      blockAds: true,
      solveCaptchas: true,
      viewport: { width: 1920, height: 1080 },
    },
  });

  console.log(`[dbar-capture] Session created: ${session.id}`);
  console.log(`[dbar-capture] Connect URL: ${maskConnectUrl(session.connectUrl)}`);

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0]!.pages()[0]!;

    patchAccessibility(page);

    console.log(`[dbar-capture] Navigating to ${args.url!}...`);
    await page.goto(args.url!, { waitUntil: "networkidle" });

    console.log("[dbar-capture] Starting DBAR capture (full determinism: virtual time + network)...");
    const dbar = await DBAR.capture(page);

    for (let i = 0; i < args.steps; i++) {
      const label = `step-${i}`;
      console.log(`[dbar-capture] Capturing step ${i + 1}/${args.steps}: ${label}`);
      await dbar.step(label);
    }

    const archive = await dbar.finish();
    const capsule = serializeCapsuleArchive(archive);

    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, capsule, "utf-8");

    console.log(`[dbar-capture] Capsule written to: ${args.output}`);
    console.log(
      `[dbar-capture] Steps: ${archive.manifest.steps.length}, ` +
      `Requests: ${archive.manifest.networkTranscript.entries.length}`
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log("[dbar-capture] Session closed.");
  }
}

main().catch((error: unknown) => {
  console.error("[dbar-capture] Fatal error:", error);
  process.exit(1);
});
