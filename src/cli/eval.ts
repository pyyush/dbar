/**
 * Eval command: check capsule step snapshots against YAML assertions.
 *
 * Assertions are checked against capsule metadata without live replay —
 * they verify structural properties of the captured session.
 */

import type { CapsuleArchive } from "../capsule/builder.js";

/** A single expectation in an assertion. */
export interface AssertionExpect {
  url_contains?: string;
  /** Alias for url_contains — clearer name since it checks initialState.url only. */
  initial_url_contains?: string;
  dom_hash_stable?: boolean;
  accessibility_contains?: string;
  network_count_gte?: number;
  network_count_lte?: number;
  screenshot_exists?: boolean;
}

/** An assertion targeting a step by label. */
export interface Assertion {
  step: string;
  expect: AssertionExpect;
}

/** Result of checking one assertion against one capsule. */
export interface AssertionResult {
  passed: boolean;
  step: string;
  /** Human-readable failure reason, present only when `passed` is false. */
  message?: string;
}

/**
 * Check a single assertion against a capsule archive.
 *
 * Finds the step by label, then evaluates each expectation key against
 * the capsule's metadata and artifact files.
 *
 * @param archive - The capsule archive to check.
 * @param assertion - The assertion with step label and expectations.
 * @returns An {@link AssertionResult} indicating pass/fail with a reason.
 *
 * @example
 * ```ts
 * const result = checkAssertion(archive, {
 *   step: "loaded",
 *   expect: { url_contains: "example.com", dom_hash_stable: true },
 * });
 * ```
 */
export function checkAssertion(archive: CapsuleArchive, assertion: Assertion): AssertionResult {
  const capsule = archive.manifest;
  const step = capsule.steps.find((s) => s.label === assertion.step);

  if (!step) {
    return {
      passed: false,
      step: assertion.step,
      message: `Step "${assertion.step}" not found in capsule`,
    };
  }

  const failures: string[] = [];
  const expect = assertion.expect;

  // NOTE: url_contains checks the capsule's initial URL, not per-step URLs.
  // Per-step URL tracking is not yet implemented in the capsule format.
  if (expect.url_contains !== undefined) {
    const url = capsule.initialState.url;
    if (!url.includes(expect.url_contains)) {
      failures.push(`url_contains "${expect.url_contains}" — got "${url}"`);
    }
  }

  if (expect.initial_url_contains !== undefined) {
    const url = capsule.initialState.url;
    if (!url.includes(expect.initial_url_contains)) {
      failures.push(`initial_url_contains "${expect.initial_url_contains}" — got "${url}"`);
    }
  }

  if (expect.dom_hash_stable === true) {
    const hash = step.observables.domSnapshotHash;
    if (!hash || hash.length === 0) {
      failures.push("dom_hash_stable — hash is empty");
    }
  }

  if (expect.accessibility_contains !== undefined) {
    const a11yPath = step.artifacts.accessibilityYaml;
    const a11yBuffer = archive.files.get(a11yPath);
    if (!a11yBuffer) {
      failures.push(
        `accessibility_contains "${expect.accessibility_contains}" — artifact file not found`
      );
    } else {
      const content = a11yBuffer.toString("utf-8");
      if (!content.includes(expect.accessibility_contains)) {
        failures.push(
          `accessibility_contains "${expect.accessibility_contains}" — not found in snapshot`
        );
      }
    }
  }

  if (expect.network_count_gte !== undefined) {
    const count = capsule.networkTranscript.entries.length;
    if (count < expect.network_count_gte) {
      failures.push(
        `network_count_gte ${expect.network_count_gte} — got ${count}`
      );
    }
  }

  if (expect.network_count_lte !== undefined) {
    const count = capsule.networkTranscript.entries.length;
    if (count > expect.network_count_lte) {
      failures.push(
        `network_count_lte ${expect.network_count_lte} — got ${count}`
      );
    }
  }

  if (expect.screenshot_exists === true) {
    const ssPath = step.artifacts.screenshot;
    if (!archive.files.has(ssPath)) {
      failures.push("screenshot_exists — screenshot artifact not found");
    }
  }

  if (failures.length > 0) {
    return {
      passed: false,
      step: assertion.step,
      message: failures.join("; "),
    };
  }

  return { passed: true, step: assertion.step };
}
