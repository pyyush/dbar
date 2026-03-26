/**
 * DBAR Capture Bridge for Browserbase
 *
 * Connects to a Browserbase cloud browser session via CDP and records a
 * determinism capsule. Supports two connection modes:
 *   1. Browserbase API: provide session ID + API key to resolve the CDP URL
 *   2. Direct CDP: provide a raw WebSocket CDP URL
 *
 * Usage:
 *   # Via Browserbase API (env vars or CLI args)
 *   BROWSERBASE_API_KEY=... BROWSERBASE_PROJECT_ID=... \
 *     node --loader ts-node/esm capture.ts --session-id <id> [--output-dir ./capsules]
 *
 *   # Via direct CDP URL
 *   node --loader ts-node/esm capture.ts --cdp-url ws://... [--output-dir ./capsules]
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
import type { CaptureSession, CapsuleArchive } from "@pyyush/dbar";

const STEP_SIGNAL = ".dbar-step";
const FINISH_SIGNAL = ".dbar-finish";
const POLL_INTERVAL_MS = 250;
const BROWSERBASE_API_BASE = "https://api.browserbase.com/v1";

/** Parsed CLI arguments for the capture script. */
interface CaptureArgs {
  cdpUrl: string | undefined;
  sessionId: string | undefined;
  apiKey: string | undefined;
  outputDir: string;
}

/** Parse CLI arguments and environment variables. */
function parseArgs(): CaptureArgs {
  const args = process.argv.slice(2);
  let cdpUrl: string | undefined;
  let sessionId: string | undefined;
  let apiKey: string | undefined;
  let outputDir = resolve("./capsules");

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === "--cdp-url" && next) {
      cdpUrl = next;
      i++;
    } else if (arg === "--session-id" && next) {
      sessionId = next;
      i++;
    } else if (arg === "--api-key" && next) {
      apiKey = next;
      i++;
    } else if (arg === "--output-dir" && next) {
      outputDir = resolve(next);
      i++;
    }
  }

  // Fall back to environment variables for Browserbase credentials.
  if (!apiKey) {
    apiKey = process.env["BROWSERBASE_API_KEY"];
  }
  if (!sessionId && !cdpUrl) {
    sessionId = process.env["BROWSERBASE_SESSION_ID"];
  }

  return { cdpUrl, sessionId, apiKey, outputDir };
}

/**
 * Resolve the CDP WebSocket URL for a Browserbase session by calling
 * the Browserbase debug endpoint.
 *
 * @param sessionId - The Browserbase session ID
 * @param apiKey - The Browserbase API key (x-bb-api-key header)
 * @returns The WebSocket CDP URL for the session
 * @throws If the API call fails or the response is missing wsUrl
 */
async function resolveCdpUrl(sessionId: string, apiKey: string): Promise<string> {
  const url = `${BROWSERBASE_API_BASE}/sessions/${sessionId}/debug`;

  const response = await fetch(url, {
    headers: { "x-bb-api-key": apiKey },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new Error(
      `Browserbase API returned ${response.status} for session ${sessionId}: ${body}. ` +
      `Verify your BROWSERBASE_API_KEY and session ID are correct.`
    );
  }

  const data = await response.json() as { wsUrl?: string; debuggerUrl?: string };

  if (!data.wsUrl) {
    throw new Error(
      `Browserbase debug response for session ${sessionId} is missing wsUrl. ` +
      `Response: ${JSON.stringify(data)}. The session may not be running.`
    );
  }

  return data.wsUrl;
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
        const label = readFileSync(STEP_SIGNAL, "utf-8").trim() || "step";
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
  const { cdpUrl: rawCdpUrl, sessionId, apiKey, outputDir } = parseArgs();

  // Resolve the CDP URL from either direct input or the Browserbase API.
  let cdpUrl: string;

  if (rawCdpUrl) {
    cdpUrl = rawCdpUrl;
    console.log(`[dbar-capture] Using direct CDP URL: ${cdpUrl}`);
  } else if (sessionId && apiKey) {
    console.log(`[dbar-capture] Resolving CDP URL for Browserbase session ${sessionId}...`);
    cdpUrl = await resolveCdpUrl(sessionId, apiKey);
    console.log(`[dbar-capture] Resolved CDP URL: ${cdpUrl}`);
  } else {
    console.error(
      "[dbar-capture] Error: provide either --cdp-url or --session-id with BROWSERBASE_API_KEY.\n" +
      "  Usage:\n" +
      "    capture.ts --cdp-url ws://...\n" +
      "    capture.ts --session-id <id> --api-key <key>\n" +
      "    BROWSERBASE_API_KEY=... capture.ts --session-id <id>"
    );
    process.exit(1);
  }

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
      await session.step(signal.label);
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
