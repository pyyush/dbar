/**
 * Pure helper functions for the DBAR + Browserbase integration.
 *
 * Extracted from CLI scripts so they can be tested hermetically
 * without network or filesystem dependencies.
 *
 * @module
 */

import { resolve, join } from "node:path";

/**
 * Mask the apiKey query parameter in a Browserbase connectUrl.
 *
 * connectUrl contains the API key as a query parameter (e.g.,
 * `wss://connect.browserbase.com?sessionId=...&apiKey=sk-...`).
 * This function replaces the apiKey value with `[MASKED]` to prevent
 * accidental leakage in log output.
 *
 * @param url - The connectUrl string (may or may not contain apiKey)
 * @returns The URL with apiKey value replaced, or the original string if parsing fails
 */
export function maskConnectUrl(url: string): string {
  // Use regex instead of URL API to avoid encoding artifacts
  // (URL encodes brackets in query values as %5B/%5D)
  return url.replace(/([?&]apiKey=)[^&]+/, "$1[MASKED]");
}

/** Result of parsing capture CLI arguments. */
export interface CaptureArgs {
  url?: string;
  steps: number;
  output: string;
  error?: string;
}

/**
 * Parse CLI arguments for the capture script.
 *
 * @param argv - Raw argument strings (without node and script path)
 * @returns Parsed arguments, or an error message if validation fails
 *
 * @example
 * ```ts
 * const args = parseCaptureArgs(["--url", "https://example.com", "--steps", "3"]);
 * if (args.error) { console.error(args.error); process.exit(1); }
 * ```
 */
export function parseCaptureArgs(argv: string[]): CaptureArgs {
  let url: string | undefined;
  let steps = 1;
  let output: string | undefined;
  let error: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--url" && next) {
      url = next;
      i++;
    } else if (arg === "--steps" && next) {
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        error = "--steps must be a positive integer";
      } else {
        steps = parsed;
      }
      i++;
    } else if (arg === "--output" && next) {
      output = next;
      i++;
    }
  }

  if (!url && !error) {
    error = "--url is required";
  }

  if (!output) {
    output = join(resolve("./capsules"), `${Date.now()}.capsule`);
  }

  return { url, steps, output, error };
}

/** Result of parsing replay CLI arguments. */
export interface ReplayArgs {
  capsulePath?: string;
  json: boolean;
  error?: string;
}

/**
 * Parse CLI arguments for the replay script.
 *
 * @param argv - Raw argument strings (without node and script path)
 * @returns Parsed arguments, or an error message if validation fails
 *
 * @example
 * ```ts
 * const args = parseReplayArgs(["./capsule.capsule", "--json"]);
 * if (args.error) { console.error(args.error); process.exit(1); }
 * ```
 */
export function parseReplayArgs(argv: string[]): ReplayArgs {
  let capsulePath: string | undefined;
  let json = false;

  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
    } else if (!arg.startsWith("--")) {
      capsulePath = arg;
    }
  }

  if (!capsulePath) {
    return { json, error: "capsule path is required" };
  }

  return { capsulePath, json };
}
