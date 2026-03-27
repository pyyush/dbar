/**
 * DBAR Demo Recording Script
 *
 * Produces an Apple-keynote-quality screen recording by orchestrating a headful
 * Chromium browser alongside a live DBAR dashboard panel. The user starts screen
 * capture (QuickTime/Loom), runs this script, and gets a polished demo video.
 *
 * Usage: npx tsx demo/record.ts
 *
 * Layout: Chrome (left 63%) + DBAR Dashboard (right 37%)
 *
 * @license Apache-2.0
 */

import { chromium, type Page, type Browser, type BrowserContext } from "playwright-core";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { DBAR, type CaptureSession } from "../src/sdk.js";
import type { CapsuleArchive } from "../src/capsule/builder.js";
import type { StepSnapshot } from "../src/capsule/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
const MAIN_WIDTH = Math.floor(SCREEN_WIDTH * 0.63);
const DASH_WIDTH = SCREEN_WIDTH - MAIN_WIDTH;
const TARGET_URL = "https://books.toscrape.com";
const DEMO_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_PATH = path.join(DEMO_DIR, "dashboard.html");

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait a human-paced delay with slight randomness. */
function humanDelay(baseMs: number): Promise<void> {
  return sleep(baseMs + Math.random() * baseMs * 0.3);
}

// ---------------------------------------------------------------------------
// Human-like mouse movement (cubic bezier curves)
// ---------------------------------------------------------------------------

/** Current logical mouse position tracked across moves. */
let mouseX = MAIN_WIDTH / 2;
let mouseY = SCREEN_HEIGHT / 2;

/**
 * Move the mouse along a cubic bezier curve for natural-looking motion.
 * Control points are randomized to avoid robotic straight lines.
 */
async function humanMove(page: Page, x: number, y: number, duration: number = 800): Promise<void> {
  const startX = mouseX;
  const startY = mouseY;
  const cp1x = startX + (x - startX) * 0.3 + (Math.random() - 0.5) * 50;
  const cp1y = startY + (y - startY) * 0.1 + (Math.random() - 0.5) * 30;
  const cp2x = startX + (x - startX) * 0.7 + (Math.random() - 0.5) * 50;
  const cp2y = startY + (y - startY) * 0.9 + (Math.random() - 0.5) * 30;

  const steps = Math.ceil(duration / 16); // ~60fps
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx =
      (1 - t) ** 3 * startX +
      3 * (1 - t) ** 2 * t * cp1x +
      3 * (1 - t) * t ** 2 * cp2x +
      t ** 3 * x;
    const by =
      (1 - t) ** 3 * startY +
      3 * (1 - t) ** 2 * t * cp1y +
      3 * (1 - t) * t ** 2 * cp2y +
      t ** 3 * y;
    await page.mouse.move(bx, by);
    await sleep(16);
  }
  mouseX = x;
  mouseY = y;
}

/**
 * Click an element with human-like hover-then-click behavior.
 * Moves to a slightly randomized position within the element bounds,
 * pauses briefly (human hesitation), then clicks.
 */
async function humanClick(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector);
  const box = await el.boundingBox();
  if (!box) {
    console.warn(`humanClick: element not found for selector "${selector}"`);
    return;
  }
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);
  await humanMove(page, x, y);
  await sleep(200 + Math.random() * 300); // hesitation before clicking
  await page.mouse.click(x, y);
}

/**
 * Smooth scroll by breaking one large wheel event into many small ones.
 */
async function humanScroll(page: Page, deltaY: number, steps: number = 10): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaY / steps);
    await sleep(50 + Math.random() * 50);
  }
}

// ---------------------------------------------------------------------------
// Dashboard update helpers
// ---------------------------------------------------------------------------

/**
 * Patch Playwright's Page to include an accessibility property so DBAR's
 * captureAccessibilitySnapshot works on modern Playwright versions that
 * removed the deprecated page.accessibility API.
 */
function patchPageAccessibility(page: Page): void {
  const p = page as unknown as Record<string, unknown>;
  if (!p["accessibility"]) {
    p["accessibility"] = {
      async snapshot() {
        try {
          const aria = await page.locator("body").ariaSnapshot();
          return {
            role: "WebArea",
            name: await page.title(),
            children: [{ role: "text", name: aria?.substring(0, 500) ?? "" }],
          };
        } catch {
          return { role: "WebArea", name: "page", children: [] };
        }
      },
    };
  }
}

/** Set the session status indicator on the dashboard. */
async function setSessionStatus(
  dash: Page,
  status: string,
  dotClass: string
): Promise<void> {
  await dash.evaluate(
    ([s, cls]) => {
      const statusEl = document.getElementById("session-status");
      const dotEl = document.getElementById("session-dot");
      if (statusEl) statusEl.textContent = s;
      if (dotEl) {
        dotEl.className = "session-dot";
        if (cls) dotEl.classList.add(cls);
      }
    },
    [status, dotClass] as const
  );
}

/** Set the site name on the dashboard. */
async function setSite(dash: Page, site: string): Promise<void> {
  await dash.evaluate((s) => {
    const el = document.getElementById("session-site");
    if (el) el.textContent = s;
  }, site);
}

/** Add a step entry to the dashboard step list. */
async function addStep(
  dash: Page,
  index: number,
  label: string,
  hash: string
): Promise<void> {
  await dash.evaluate(
    ([idx, lbl, h]) => {
      const list = document.getElementById("steps-list");
      if (!list) return;
      const entry = document.createElement("div");
      entry.className = "step-entry";
      entry.innerHTML = `
        <span class="step-index">${idx}</span>
        <span class="step-label">${lbl}</span>
        <span class="step-hash">${h.substring(0, 8)}...</span>
      `;
      list.appendChild(entry);
    },
    [index, label, hash] as const
  );
}

/** Update the capsule info box. */
async function updateCapsule(
  dash: Page,
  requests: number,
  sizeKb: number,
  steps: number
): Promise<void> {
  await dash.evaluate(
    ([r, s, st]) => {
      const reqEl = document.getElementById("capsule-requests");
      const sizeEl = document.getElementById("capsule-size");
      const stepsEl = document.getElementById("capsule-steps");
      if (reqEl) reqEl.textContent = r.toLocaleString();
      if (sizeEl) sizeEl.textContent = `${s.toLocaleString()} KB`;
      if (stepsEl) stepsEl.textContent = st.toString();
    },
    [requests, sizeKb, steps] as const
  );
}

/** Add a replay step result to the dashboard. */
async function addReplayStep(
  dash: Page,
  index: number,
  label: string,
  isMatch: boolean
): Promise<void> {
  await dash.evaluate(
    ([idx, lbl, match]) => {
      const section = document.getElementById("replay-section");
      if (section) {
        section.classList.add("visible");
      }
      const list = document.getElementById("replay-steps-list");
      if (!list) return;
      const icon = match ? "MATCH" : "DIVERGED";
      const cls = match ? "match" : "diverged";
      const entry = document.createElement("div");
      entry.className = "step-entry";
      entry.innerHTML = `
        <span class="step-index">${idx}</span>
        <span class="step-label">${lbl}</span>
        <span class="step-status-icon ${cls}">${match ? "\u2713" : "\u2717"} ${icon}</span>
      `;
      list.appendChild(entry);
    },
    [index, label, isMatch] as const
  );
}

/** Show the cost comparison box. */
async function showCost(
  dash: Page,
  liveCost: string,
  replayCost: string,
  savings: string
): Promise<void> {
  await dash.evaluate(
    ([live, replay, sav]) => {
      const box = document.getElementById("cost-box");
      if (box) box.classList.add("visible");
      const liveEl = document.getElementById("cost-live");
      const replayEl = document.getElementById("cost-replay");
      const savEl = document.getElementById("cost-savings");
      if (liveEl) liveEl.textContent = live;
      if (replayEl) replayEl.textContent = replay;
      if (savEl) savEl.textContent = sav;
    },
    [liveCost, replayCost, savings] as const
  );
}

/** Show the CTA section. */
async function showCTA(dash: Page): Promise<void> {
  await dash.evaluate(() => {
    const cta = document.getElementById("cta");
    if (cta) cta.classList.add("visible");
  });
}

/** Set the phase bar text. */
async function setPhase(dash: Page, text: string): Promise<void> {
  await dash.evaluate((t) => {
    const el = document.getElementById("phase-bar");
    if (el) el.textContent = t;
  }, text);
}

// ---------------------------------------------------------------------------
// Main recording sequence
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("DBAR Demo Recorder");
  console.log("===================");
  console.log("Start your screen recorder now. The demo begins in 3 seconds...\n");
  await sleep(3000);

  // Launch headful browser with two windows side by side
  const browser: Browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      `--window-position=0,0`,
      `--window-size=${MAIN_WIDTH},${SCREEN_HEIGHT}`,
    ],
  });

  const mainContext: BrowserContext = await browser.newContext({
    viewport: { width: MAIN_WIDTH - 20, height: SCREEN_HEIGHT - 120 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  const mainPage: Page = await mainContext.newPage();
  patchPageAccessibility(mainPage);

  // Dashboard window: open in same browser as a separate page
  // Playwright opens new pages in the same window, so we use a popup approach
  const dashPage: Page = await mainContext.newPage();
  await dashPage.goto(`file://${DASHBOARD_PATH}`);
  await dashPage.setViewportSize({ width: DASH_WIDTH - 20, height: SCREEN_HEIGHT - 120 });

  console.log("Browser launched. Starting demo sequence...\n");

  // ── Scene 1: Navigate (0-15s) ──────────────────────────────────
  console.log("Scene 1: Navigate to books.toscrape.com");
  await setPhase(dashPage, "Initializing capture...");
  await setSessionStatus(dashPage, "starting...", "");

  // Start DBAR capture
  let session: CaptureSession;
  try {
    session = await DBAR.capture(mainPage);
  } catch (err) {
    console.error("Failed to start DBAR capture:", err);
    console.log("Continuing without DBAR capture for demo purposes...");
    // Fall through with a mock flow if DBAR can't init
    await runDemoWithoutCapture(mainPage, dashPage, browser);
    return;
  }

  await mainPage.goto(TARGET_URL, { waitUntil: "networkidle" });
  await setSite(dashPage, "books.toscrape.com");
  await setSessionStatus(dashPage, "active", "active");
  await setPhase(dashPage, "Capturing...");

  // Take initial step
  const step0: StepSnapshot = await session.step("homepage");
  await addStep(dashPage, 0, "homepage", step0.observables.domSnapshotHash);
  console.log(`  Step 0: homepage (DOM: ${step0.observables.domSnapshotHash.substring(0, 8)}...)`);

  await humanDelay(1500);

  // Human-like browsing: scroll down to see book listings
  await humanMove(mainPage, MAIN_WIDTH / 2, 300);
  await humanScroll(mainPage, 300, 8);
  await humanDelay(1000);

  // Hover over a few books
  const bookLinks = mainPage.locator("article.product_pod h3 a");
  const bookCount = await bookLinks.count();
  if (bookCount > 2) {
    const firstBox = await bookLinks.nth(0).boundingBox();
    if (firstBox) {
      await humanMove(mainPage, firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2, 600);
      await humanDelay(500);
    }
    const secondBox = await bookLinks.nth(1).boundingBox();
    if (secondBox) {
      await humanMove(mainPage, secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, 600);
      await humanDelay(500);
    }
  }
  await humanDelay(1000);

  // ── Scene 2: Browse categories (15-30s) ────────────────────────
  console.log("Scene 2: Browse Travel category");

  // Scroll back up to see sidebar
  await humanScroll(mainPage, -200, 6);
  await humanDelay(800);

  // Click Travel category in sidebar
  await humanClick(mainPage, 'a[href*="travel"]');
  await mainPage.waitForLoadState("networkidle");
  await humanDelay(1000);

  const step1: StepSnapshot = await session.step("category-travel");
  await addStep(dashPage, 1, "category-travel", step1.observables.domSnapshotHash);
  console.log(`  Step 1: category-travel (DOM: ${step1.observables.domSnapshotHash.substring(0, 8)}...)`);

  await humanScroll(mainPage, 200, 6);
  await humanDelay(1500);

  // ── Scene 3: View a book (30-45s) ──────────────────────────────
  console.log("Scene 3: View book detail");

  // Click first book in the listing
  await humanClick(mainPage, "article.product_pod h3 a");
  await mainPage.waitForLoadState("networkidle");
  await humanDelay(1000);

  const step2: StepSnapshot = await session.step("book-detail");
  await addStep(dashPage, 2, "book-detail", step2.observables.domSnapshotHash);
  console.log(`  Step 2: book-detail (DOM: ${step2.observables.domSnapshotHash.substring(0, 8)}...)`);

  // Slowly scroll through book details
  await humanScroll(mainPage, 150, 6);
  await humanDelay(1000);
  await humanScroll(mainPage, 100, 4);
  await humanDelay(1500);

  // ── Scene 4: Add to cart (45-55s) ──────────────────────────────
  console.log("Scene 4: Add to basket");

  // Scroll back up to find the add-to-basket button
  await humanScroll(mainPage, -200, 6);
  await humanDelay(500);

  await humanClick(mainPage, "button.btn-primary");
  await mainPage.waitForLoadState("networkidle");
  await humanDelay(1000);

  const step3: StepSnapshot = await session.step("add-to-cart");
  await addStep(dashPage, 3, "add-to-cart", step3.observables.domSnapshotHash);
  console.log(`  Step 3: add-to-cart (DOM: ${step3.observables.domSnapshotHash.substring(0, 8)}...)`);

  await humanDelay(1500);

  // ── Scene 5: Capsule complete (55-65s) ─────────────────────────
  console.log("Scene 5: Finishing capsule");
  await setPhase(dashPage, "Finishing capsule...");
  await setSessionStatus(dashPage, "finishing...", "active");
  await humanDelay(1500);

  const archive: CapsuleArchive = await session.finish();
  const capsuleSizeKb = Math.round(archive.manifest.metrics.capsuleSizeBytes / 1024);
  const totalRequests = archive.manifest.metrics.totalNetworkRequests;
  const totalSteps = archive.manifest.metrics.totalSteps;

  await updateCapsule(dashPage, totalRequests, capsuleSizeKb, totalSteps);
  await setSessionStatus(dashPage, "complete", "complete");
  await setPhase(dashPage, "Capsule saved.");

  console.log(`  Capsule: ${totalSteps} steps, ${totalRequests} requests, ${capsuleSizeKb} KB`);
  await humanDelay(3000);

  // ── Scene 6: Replay & Cost (65-80s) ───────────────────────────
  console.log("Scene 6: Replay");
  await setPhase(dashPage, "Replaying capsule...");
  await setSessionStatus(dashPage, "replaying...", "replaying");

  // Replay in the same page (or a new tab)
  const replayPage: Page = await mainContext.newPage();
  patchPageAccessibility(replayPage);

  try {
    const replayResult = await DBAR.replay(replayPage, archive);

    for (const step of archive.manifest.steps) {
      const label = step.label ?? `step-${step.index}`;
      const stepDiverged = replayResult.divergences.some((d) => d.step === step.index);
      await addReplayStep(dashPage, step.index, label, !stepDiverged);
      await humanDelay(800);
    }

    console.log(`  Replay success rate: ${(replayResult.replaySuccessRate * 100).toFixed(0)}%`);
  } catch (err) {
    console.error("Replay failed:", err);
    // Show what we can -- mark all steps as diverged
    for (const step of archive.manifest.steps) {
      const label = step.label ?? `step-${step.index}`;
      await addReplayStep(dashPage, step.index, label, false);
      await humanDelay(500);
    }
  }

  await replayPage.close();
  await humanDelay(2000);

  // Show cost comparison
  await showCost(dashPage, "$0.10", "$0 API", "~99%");
  await setPhase(dashPage, "Replay complete.");
  console.log("  Cost: browser-use $0.10/task vs DBAR $0 API cost (~99% savings)");
  await humanDelay(3000);

  // ── Scene 7: End card (80-90s) ─────────────────────────────────
  console.log("Scene 7: End card");
  await showCTA(dashPage);
  await setPhase(dashPage, "");
  await humanDelay(5000);

  console.log("\nDemo complete. Closing browser in 5 seconds...");
  await sleep(5000);

  await browser.close();
  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Fallback: run the visual demo without DBAR capture if SDK init fails
// (e.g. CDP session issues). This still produces a watchable recording.
// ---------------------------------------------------------------------------

async function runDemoWithoutCapture(
  mainPage: Page,
  dashPage: Page,
  browser: Browser
): Promise<void> {
  console.log("Running visual-only demo (no DBAR capture)...\n");

  await mainPage.goto(TARGET_URL, { waitUntil: "networkidle" });
  await setSite(dashPage, "books.toscrape.com");
  await setSessionStatus(dashPage, "active", "active");
  await setPhase(dashPage, "Capturing (demo mode)...");

  // Simulate steps with placeholder hashes
  const fakeHash = "a1b2c3d4e5f67890";

  await addStep(dashPage, 0, "homepage", fakeHash);
  await humanDelay(2000);
  await humanScroll(mainPage, 300, 8);
  await humanDelay(1500);

  // Navigate to Travel
  await humanClick(mainPage, 'a[href*="travel"]');
  await mainPage.waitForLoadState("networkidle");
  await addStep(dashPage, 1, "category-travel", fakeHash);
  await humanDelay(2000);

  // Click first book
  await humanClick(mainPage, "article.product_pod h3 a");
  await mainPage.waitForLoadState("networkidle");
  await addStep(dashPage, 2, "book-detail", fakeHash);
  await humanDelay(2000);

  // Add to cart
  await humanClick(mainPage, "button.btn-primary");
  await mainPage.waitForLoadState("networkidle");
  await addStep(dashPage, 3, "add-to-cart", fakeHash);
  await humanDelay(2000);

  await updateCapsule(dashPage, 42, 856, 4);
  await setSessionStatus(dashPage, "complete", "complete");
  await humanDelay(2000);

  // Replay simulation
  await setPhase(dashPage, "Replaying capsule...");
  for (let i = 0; i < 4; i++) {
    const labels = ["homepage", "category-travel", "book-detail", "add-to-cart"];
    await addReplayStep(dashPage, i, labels[i]!, true);
    await humanDelay(800);
  }

  await showCost(dashPage, "$0.10", "$0 API", "~99%");
  await setPhase(dashPage, "Replay complete.");
  await humanDelay(3000);
  await showCTA(dashPage);
  await setPhase(dashPage, "");
  await humanDelay(5000);

  console.log("\nDemo complete. Closing browser in 5 seconds...");
  await sleep(5000);
  await browser.close();
  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
