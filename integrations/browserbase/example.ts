/**
 * DBAR + Browserbase integration example
 *
 * Demonstrates the full flow:
 *   1. Create a Browserbase session via their REST API
 *   2. Connect DBAR to the session's CDP endpoint
 *   3. Run agent actions on the cloud browser
 *   4. Signal DBAR to capture steps
 *   5. Get a deterministic capsule
 *   6. Replay locally to verify
 *
 * Prerequisites:
 *   export BROWSERBASE_API_KEY=your-api-key
 *   export BROWSERBASE_PROJECT_ID=your-project-id
 *   cd integrations/browserbase && npm install
 *
 * Usage:
 *   node --loader ts-node/esm example.ts
 *
 * @module
 */

import { writeFileSync, unlinkSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive, deserializeCapsuleArchive } from "@pyyush/dbar";

const BROWSERBASE_API_BASE = "https://api.browserbase.com/v1";
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

/** Create a new Browserbase session and return the session ID. */
async function createSession(apiKey: string, projectId: string): Promise<string> {
  const response = await fetch(`${BROWSERBASE_API_BASE}/sessions`, {
    method: "POST",
    headers: {
      "x-bb-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ projectId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(`Failed to create Browserbase session (${response.status}): ${body}`);
  }

  const data = await response.json() as { id: string };
  return data.id;
}

/** Get the CDP WebSocket URL for a Browserbase session. */
async function getDebugUrl(apiKey: string, sessionId: string): Promise<string> {
  const response = await fetch(`${BROWSERBASE_API_BASE}/sessions/${sessionId}/debug`, {
    headers: { "x-bb-api-key": apiKey },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(`Failed to get debug URL for session ${sessionId} (${response.status}): ${body}`);
  }

  const data = await response.json() as { wsUrl: string };
  return data.wsUrl;
}

async function main(): Promise<void> {
  const apiKey = requireEnv("BROWSERBASE_API_KEY");
  const projectId = requireEnv("BROWSERBASE_PROJECT_ID");

  // -------------------------------------------------------------------------
  // Step 1: Create a Browserbase session
  // -------------------------------------------------------------------------
  console.log("[example] Creating Browserbase session...");
  const sessionId = await createSession(apiKey, projectId);
  console.log(`[example] Session created: ${sessionId}`);

  // -------------------------------------------------------------------------
  // Step 2: Get the CDP URL and connect via Playwright
  // -------------------------------------------------------------------------
  console.log("[example] Resolving CDP URL...");
  const wsUrl = await getDebugUrl(apiKey, sessionId);
  console.log(`[example] CDP URL: ${wsUrl}`);

  const browser = await chromium.connectOverCDP(wsUrl);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error("No browser context found after CDP connect");
  }

  const page = context.pages()[0] ?? await context.newPage();
  console.log(`[example] Connected to page: ${page.url()}`);

  // -------------------------------------------------------------------------
  // Step 3: Start DBAR capture
  // -------------------------------------------------------------------------
  console.log("[example] Starting DBAR capture...");
  const session = await DBAR.capture(page);
  console.log(`[example] Capture session ${session.id} started`);

  // -------------------------------------------------------------------------
  // Step 4: Perform agent actions and capture steps
  //
  // In a real integration, these would be driven by an AI agent framework
  // (Stagehand, browser-use, custom Playwright scripts, etc.). Here we
  // navigate to a page as a minimal demonstration.
  // -------------------------------------------------------------------------
  console.log("[example] Navigating to example.com...");
  await page.goto("https://example.com", { waitUntil: "networkidle" });
  await session.step("after-navigation");
  console.log("[example] Step 1 captured: after-navigation");

  const title = await page.title();
  console.log(`[example] Page title: ${title}`);
  await session.step("after-title-read");
  console.log("[example] Step 2 captured: after-title-read");

  // -------------------------------------------------------------------------
  // Step 5: Finish capture and write capsule
  // -------------------------------------------------------------------------
  console.log("[example] Finishing capture...");
  const archive = await session.finish();

  const { mkdirSync } = await import("node:fs");
  mkdirSync(CAPSULES_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const capsulePath = join(CAPSULES_DIR, `capsule-${timestamp}.json`);
  const serialized = serializeCapsuleArchive(archive);
  writeFileSync(capsulePath, serialized, "utf-8");

  console.log(`[example] Capsule written to: ${capsulePath}`);
  console.log(`[example] Steps: ${archive.manifest.steps.length}, Requests: ${archive.manifest.networkTranscript.entries.length}`);

  await browser.close();

  // -------------------------------------------------------------------------
  // Step 6: Replay locally to verify determinism
  //
  // The capsule was recorded on Browserbase's cloud browser.
  // Replay runs on a local browser to prove the session is reproducible.
  // -------------------------------------------------------------------------
  console.log("[example] Replaying capsule locally...");

  const replaySerialized = readFileSync(capsulePath, "utf-8");
  const replayArchive = deserializeCapsuleArchive(replaySerialized);
  const manifest = replayArchive.manifest;

  const localBrowser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", ...(process.env["DBAR_NO_SANDBOX"] === "1" ? ["--no-sandbox"] : [])],
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

  console.log(`[example] Replay complete:`);
  console.log(`[example]   Success: ${result.success}`);
  console.log(`[example]   RSR: ${(result.replaySuccessRate * 100).toFixed(1)}%`);
  console.log(`[example]   DVR: ${(result.determinismViolationRate * 100).toFixed(1)}%`);
  console.log(`[example]   Divergences: ${result.divergences.length}`);
  console.log(`[example]   Overhead: ${result.overheadMs}ms`);

  await localBrowser.close();

  process.exit(result.success ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("[example] Fatal error:", error);
  process.exit(2);
});
