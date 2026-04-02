/**
 * DBAR + Browserbase End-to-End Example
 *
 * Demonstrates the full flow:
 *   1. Create Browserbase session via SDK
 *   2. Navigate to books.toscrape.com
 *   3. DBAR captures with full determinism (virtual time + network)
 *   4. Browse a few pages (click category, click book)
 *   5. Finish capture, save capsule
 *   6. Replay locally, show results
 *   7. Clean up session
 *
 * Prerequisites:
 *   export BROWSERBASE_API_KEY=your-api-key
 *   export BROWSERBASE_PROJECT_ID=your-project-id
 *
 * Usage:
 *   npx tsx example.ts
 *
 * @module
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive, deserializeCapsuleArchive } from "@pyyush/dbar";

import { maskConnectUrl } from "./helpers.js";

const CAPSULES_DIR = resolve("./capsules");

/** Resolve required environment variable or exit with an actionable message. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[example] Missing required environment variable: ${name}`);
    console.error(`[example] Set it with: export ${name}=<value>`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("BROWSERBASE_API_KEY");
  const projectId = requireEnv("BROWSERBASE_PROJECT_ID");

  // -------------------------------------------------------------------------
  // 1. Create a Browserbase session via SDK
  // -------------------------------------------------------------------------
  const bb = new Browserbase({ apiKey });

  console.log("[example] Creating Browserbase session...");
  const session = await bb.sessions.create({
    projectId,
    browserSettings: {
      blockAds: true,
      solveCaptchas: true,
      viewport: { width: 1920, height: 1080 },
    },
  });
  console.log(`[example] Session created: ${session.id}`);
  console.log(`[example] Connect URL: ${maskConnectUrl(session.connectUrl)}`);

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    // -----------------------------------------------------------------------
    // 2. Connect via CDP
    // -----------------------------------------------------------------------
    browser = await chromium.connectOverCDP(session.connectUrl);
    const page = browser.contexts()[0]!.pages()[0]!;

    // -----------------------------------------------------------------------
    // 3. Navigate and start DBAR capture
    // -----------------------------------------------------------------------
    console.log("[example] Navigating to books.toscrape.com...");
    await page.goto("https://books.toscrape.com/", { waitUntil: "networkidle" });

    console.log("[example] Starting DBAR capture (full determinism)...");
    const dbarSession = await DBAR.capture(page);

    // Step 0: Homepage loaded
    await dbarSession.step("homepage");
    console.log("[example] Step 1 captured: homepage");

    // -----------------------------------------------------------------------
    // 4. Browse — click a category, then a book
    // -----------------------------------------------------------------------
    const categoryLink = page.locator("aside .nav-list ul a").first();
    if (await categoryLink.count() > 0) {
      console.log("[example] Clicking first category...");
      await categoryLink.click();
      await page.waitForLoadState("networkidle");
      await dbarSession.step("category-page");
      console.log("[example] Step 2 captured: category-page");
    }

    const bookLink = page.locator("article.product_pod h3 a").first();
    if (await bookLink.count() > 0) {
      console.log("[example] Clicking first book...");
      await bookLink.click();
      await page.waitForLoadState("networkidle");
      await dbarSession.step("book-detail");
      console.log("[example] Step 3 captured: book-detail");
    }

    // -----------------------------------------------------------------------
    // 5. Finish capture, save capsule
    // -----------------------------------------------------------------------
    console.log("[example] Finishing capture...");
    const archive = await dbarSession.finish();

    mkdirSync(CAPSULES_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const capsulePath = join(CAPSULES_DIR, `example-${timestamp}.capsule`);
    const serialized = serializeCapsuleArchive(archive);
    writeFileSync(capsulePath, serialized, "utf-8");

    console.log(`[example] Capsule written to: ${capsulePath}`);
    console.log(
      `[example] Steps: ${archive.manifest.steps.length}, ` +
      `Requests: ${archive.manifest.networkTranscript.entries.length}`
    );

    // Close cloud browser before local replay
    await browser.close();
    browser = undefined;

    // -----------------------------------------------------------------------
    // 6. Replay locally
    // -----------------------------------------------------------------------
    console.log("[example] Replaying capsule locally...");

    const replaySerialized = readFileSync(capsulePath, "utf-8");
    const replayArchive = deserializeCapsuleArchive(replaySerialized);
    const manifest = replayArchive.manifest;

    const noSandbox = process.env["DBAR_NO_SANDBOX"] === "1";
    const localBrowser = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        ...(noSandbox ? ["--no-sandbox"] : []),
      ],
    });

    const localContext = await localBrowser.newContext({
      viewport: {
        width: manifest.environment.viewport.width,
        height: manifest.environment.viewport.height,
      },
      locale: manifest.environment.locale,
      timezoneId: manifest.environment.timezone,
      userAgent: manifest.environment.userAgent,
    });

    const localPage = await localContext.newPage();
    const result = await DBAR.replay(localPage, replayArchive);

    console.log("[example] Replay complete:");
    console.log(`[example]   Success: ${result.success}`);
    console.log(`[example]   RSR: ${(result.replaySuccessRate * 100).toFixed(1)}%`);
    console.log(`[example]   DVR: ${(result.determinismViolationRate * 100).toFixed(1)}%`);
    console.log(`[example]   Divergences: ${result.divergences.length}`);
    console.log(`[example]   Overhead: ${result.overheadMs}ms`);

    await localBrowser.close();

    // -----------------------------------------------------------------------
    // 7. Done
    // -----------------------------------------------------------------------
    process.exit(result.success ? 0 : 1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch((error: unknown) => {
  console.error("[example] Fatal error:", error);
  process.exit(2);
});
