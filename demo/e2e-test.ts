/**
 * DBAR End-to-End Test: Capture -> Replay on Real Websites
 *
 * Validates that DBAR can capture multi-step browser sessions and replay them
 * with 100% determinism on static websites.
 *
 * Usage: npx tsx demo/e2e-test.ts
 *
 * Tested sites:
 *   1. books.toscrape.com  — multi-step: homepage -> category -> book detail
 *   2. example.com         — simple: load page
 *   3. quotes.toscrape.com — multi-step: homepage -> next page
 *
 * @license Apache-2.0
 */

import { chromium, type Page, type BrowserContext } from "playwright-core";

import { DBAR, type CaptureSession, type ReplaySession } from "../src/sdk.js";
import type { CapsuleArchive } from "../src/capsule/builder.js";
import type { ReplayResult } from "../src/capsule/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TestResult {
  site: string;
  steps: number;
  captureOk: boolean;
  replaySuccessRate: number;
  divergences: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Test: books.toscrape.com (3 steps)
// ---------------------------------------------------------------------------

async function testBooksToscrape(context: BrowserContext): Promise<TestResult> {
  const site = "books.toscrape.com";
  const result: TestResult = { site, steps: 0, captureOk: false, replaySuccessRate: 0, divergences: [] };

  let capturePage: Page | undefined;
  let replayPage: Page | undefined;

  try {
    // --- Capture ---
    capturePage = await context.newPage();
    const session: CaptureSession = await DBAR.capture(capturePage);

    // Step 0: Navigate to homepage
    await capturePage.goto("https://books.toscrape.com", { waitUntil: "networkidle", timeout: 30000 });
    await sleep(500);
    const s0 = await session.step("homepage");
    console.log(`  [capture] step 0 homepage: DOM=${s0.observables.domSnapshotHash.slice(0, 8)}...`);

    // Step 1: Click Travel category
    await capturePage.click('a[href*="travel"]');
    await capturePage.waitForLoadState("networkidle");
    await sleep(500);
    const s1 = await session.step("category-travel");
    console.log(`  [capture] step 1 category: DOM=${s1.observables.domSnapshotHash.slice(0, 8)}...`);

    // Step 2: Click first book
    await capturePage.click("article.product_pod h3 a");
    await capturePage.waitForLoadState("networkidle");
    await sleep(500);
    const s2 = await session.step("book-detail");
    console.log(`  [capture] step 2 detail:   DOM=${s2.observables.domSnapshotHash.slice(0, 8)}...`);

    const archive: CapsuleArchive = await session.finish();
    result.steps = archive.manifest.steps.length;
    result.captureOk = true;
    console.log(`  [capture] done: ${result.steps} steps, ${archive.manifest.metrics.totalNetworkRequests} requests`);

    await capturePage.close();
    capturePage = undefined;

    // --- Replay ---
    replayPage = await context.newPage();
    const rs: ReplaySession = await DBAR.startReplay(replayPage, archive, {
      unmatchedRequestPolicy: "continue",
    });

    // Replay step 0: navigate to homepage (same action as capture)
    await replayPage.goto("https://books.toscrape.com", { waitUntil: "networkidle", timeout: 30000 });
    await sleep(500);
    const r0 = await rs.step();
    console.log(`  [replay]  step 0 homepage: matched=${r0.matched}`);
    if (!r0.matched) {
      result.divergences.push(...r0.divergences.map(d => `step0:${d.type}`));
      for (const d of r0.divergences) {
        console.log(`    divergence: ${d.type} expected=${d.expected?.slice(0,8)}... actual=${d.actual?.slice(0,8)}...`);
      }
    }

    // Replay step 1: click Travel category
    await replayPage.click('a[href*="travel"]');
    await replayPage.waitForLoadState("networkidle");
    await sleep(500);
    const r1 = await rs.step();
    console.log(`  [replay]  step 1 category: matched=${r1.matched}`);
    if (!r1.matched) result.divergences.push(...r1.divergences.map(d => `step1:${d.type}`));

    // Replay step 2: click first book
    await replayPage.click("article.product_pod h3 a");
    await replayPage.waitForLoadState("networkidle");
    await sleep(500);
    const r2 = await rs.step();
    console.log(`  [replay]  step 2 detail:   matched=${r2.matched}`);
    if (!r2.matched) result.divergences.push(...r2.divergences.map(d => `step2:${d.type}`));

    const replayResult: ReplayResult = await rs.finish();
    result.replaySuccessRate = replayResult.replaySuccessRate;

    await replayPage.close();
    replayPage = undefined;
  } catch (err) {
    result.error = String(err);
  } finally {
    if (capturePage) await capturePage.close().catch(() => {});
    if (replayPage) await replayPage.close().catch(() => {});
  }

  return result;
}

// ---------------------------------------------------------------------------
// Test: example.com (1 step)
// ---------------------------------------------------------------------------

async function testExampleCom(context: BrowserContext): Promise<TestResult> {
  const site = "example.com";
  const result: TestResult = { site, steps: 0, captureOk: false, replaySuccessRate: 0, divergences: [] };

  let capturePage: Page | undefined;
  let replayPage: Page | undefined;

  try {
    // --- Capture ---
    capturePage = await context.newPage();
    const session: CaptureSession = await DBAR.capture(capturePage);

    await capturePage.goto("https://example.com", { waitUntil: "networkidle", timeout: 30000 });
    await sleep(500);
    const s0 = await session.step("homepage");
    console.log(`  [capture] step 0 homepage: DOM=${s0.observables.domSnapshotHash.slice(0, 8)}...`);

    const archive: CapsuleArchive = await session.finish();
    result.steps = archive.manifest.steps.length;
    result.captureOk = true;
    console.log(`  [capture] done: ${result.steps} steps, ${archive.manifest.metrics.totalNetworkRequests} requests`);

    await capturePage.close();
    capturePage = undefined;

    // --- Replay ---
    replayPage = await context.newPage();
    const rs: ReplaySession = await DBAR.startReplay(replayPage, archive, {
      unmatchedRequestPolicy: "continue",
    });

    await replayPage.goto("https://example.com", { waitUntil: "networkidle", timeout: 30000 });
    await sleep(500);
    const r0 = await rs.step();
    console.log(`  [replay]  step 0 homepage: matched=${r0.matched}`);
    if (!r0.matched) result.divergences.push(...r0.divergences.map(d => `step0:${d.type}`));

    const replayResult: ReplayResult = await rs.finish();
    result.replaySuccessRate = replayResult.replaySuccessRate;

    await replayPage.close();
    replayPage = undefined;
  } catch (err) {
    result.error = String(err);
  } finally {
    if (capturePage) await capturePage.close().catch(() => {});
    if (replayPage) await replayPage.close().catch(() => {});
  }

  return result;
}

// ---------------------------------------------------------------------------
// Test: quotes.toscrape.com (2 steps)
// ---------------------------------------------------------------------------

async function testQuotesToscrape(context: BrowserContext): Promise<TestResult> {
  const site = "quotes.toscrape.com";
  const result: TestResult = { site, steps: 0, captureOk: false, replaySuccessRate: 0, divergences: [] };

  let capturePage: Page | undefined;
  let replayPage: Page | undefined;

  try {
    // --- Capture ---
    capturePage = await context.newPage();
    const session: CaptureSession = await DBAR.capture(capturePage);

    await capturePage.goto("https://quotes.toscrape.com", { waitUntil: "networkidle", timeout: 30000 });
    await sleep(500);
    const s0 = await session.step("homepage");
    console.log(`  [capture] step 0 homepage: DOM=${s0.observables.domSnapshotHash.slice(0, 8)}...`);

    // Step 1: Click "Next" page link
    await capturePage.click("li.next a");
    await capturePage.waitForLoadState("networkidle");
    await sleep(500);
    const s1 = await session.step("page-2");
    console.log(`  [capture] step 1 page-2:   DOM=${s1.observables.domSnapshotHash.slice(0, 8)}...`);

    const archive: CapsuleArchive = await session.finish();
    result.steps = archive.manifest.steps.length;
    result.captureOk = true;
    console.log(`  [capture] done: ${result.steps} steps, ${archive.manifest.metrics.totalNetworkRequests} requests`);

    await capturePage.close();
    capturePage = undefined;

    // --- Replay ---
    replayPage = await context.newPage();
    const rs: ReplaySession = await DBAR.startReplay(replayPage, archive, {
      unmatchedRequestPolicy: "continue",
    });

    await replayPage.goto("https://quotes.toscrape.com", { waitUntil: "networkidle", timeout: 30000 });
    await sleep(500);
    const r0 = await rs.step();
    console.log(`  [replay]  step 0 homepage: matched=${r0.matched}`);
    if (!r0.matched) result.divergences.push(...r0.divergences.map(d => `step0:${d.type}`));

    await replayPage.click("li.next a");
    await replayPage.waitForLoadState("networkidle");
    await sleep(500);
    const r1 = await rs.step();
    console.log(`  [replay]  step 1 page-2:   matched=${r1.matched}`);
    if (!r1.matched) result.divergences.push(...r1.divergences.map(d => `step1:${d.type}`));

    const replayResult: ReplayResult = await rs.finish();
    result.replaySuccessRate = replayResult.replaySuccessRate;

    await replayPage.close();
    replayPage = undefined;
  } catch (err) {
    result.error = String(err);
  } finally {
    if (capturePage) await capturePage.close().catch(() => {});
    if (replayPage) await replayPage.close().catch(() => {});
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("DBAR E2E Test — Capture -> Replay on Real Websites");
  console.log("===================================================\n");

  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: "UTC",
  });

  const results: TestResult[] = [];

  // Run tests sequentially to avoid resource contention
  for (const [name, testFn] of [
    ["books.toscrape.com", testBooksToscrape],
    ["example.com", testExampleCom],
    ["quotes.toscrape.com", testQuotesToscrape],
  ] as const) {
    console.log(`\nTesting ${name}...`);
    const result = await testFn(context);
    results.push(result);
  }

  await browser.close();

  // --- Summary ---
  console.log("\n===================================================");
  console.log("RESULTS\n");

  let allPassed = true;
  for (const r of results) {
    const status = r.error
      ? "ERROR"
      : r.replaySuccessRate === 1
        ? "PASS"
        : "FAIL";
    if (status !== "PASS") allPassed = false;

    console.log(`  ${status === "PASS" ? "OK" : "XX"} ${r.site}`);
    console.log(`     steps: ${r.steps}, replay rate: ${(r.replaySuccessRate * 100).toFixed(0)}%`);
    if (r.divergences.length > 0) {
      console.log(`     divergences: ${r.divergences.join(", ")}`);
    }
    if (r.error) {
      console.log(`     error: ${r.error.slice(0, 200)}`);
    }
  }

  console.log(`\nOverall: ${allPassed ? "ALL PASSED" : "SOME FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
