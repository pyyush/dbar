import type { CDPSession, Page } from "playwright-core";

import type { CapsuleStep, Divergence, StepObservables } from "../capsule/types.js";
import { captureDOMSnapshot } from "../snapshot/dom.js";
import { captureAccessibilitySnapshot } from "../snapshot/accessibility.js";
import { captureScreenshot } from "../snapshot/screenshot.js";

export interface ReplayStepNetworkSource {
  getStepNetworkDigest(stepIndex: number): string;
  getDivergencesForStep(stepIndex: number): Divergence[];
}

export interface ReplayStepTimeSource {
  pause(): Promise<void>;
  waitForQuiescence(): Promise<{ quiescent: boolean }>;
}

export interface ReplayStepComparisonOptions {
  screenshotMasks?: string[];
  compareScreenshots?: boolean;
}

export interface ReplayStepComparison {
  liveObservables: StepObservables;
  stepDivergences: Divergence[];
  recordableDivergences: Divergence[];
  matched: boolean;
}

export function isBlockingDivergence(divergence: Pick<Divergence, "type">): boolean {
  return divergence.type !== "screenshot_mismatch";
}

export function countFailedSteps(divergences: Divergence[]): number {
  return new Set(divergences.filter(isBlockingDivergence).map((divergence) => divergence.step)).size;
}

export async function compareReplayStep(args: {
  expectedStep: CapsuleStep;
  page: Page;
  cdpSession: CDPSession;
  network: ReplayStepNetworkSource;
  timeVirtualizer: ReplayStepTimeSource;
  options: ReplayStepComparisonOptions;
}): Promise<ReplayStepComparison> {
  const { expectedStep, page, cdpSession, network, timeVirtualizer, options } = args;
  const recordableDivergences: Divergence[] = [];
  let matched = true;

  await timeVirtualizer.pause();

  const { quiescent } = await timeVirtualizer.waitForQuiescence();
  if (!quiescent) {
    matched = false;
    recordableDivergences.push({
      step: expectedStep.index,
      type: "quiescence_timeout",
    });
  }

  const [domResult, a11yResult, screenshotResult] = await Promise.all([
    captureDOMSnapshot(cdpSession),
    captureAccessibilitySnapshot(page, cdpSession),
    captureScreenshot(page, { masks: options.screenshotMasks }),
  ]);

  const liveObservables: StepObservables = {
    domSnapshotHash: domResult.hash,
    accessibilityHash: a11yResult.hash,
    screenshotHash: screenshotResult.hash,
    networkDigest: network.getStepNetworkDigest(expectedStep.index),
  };

  const networkDivergences = network.getDivergencesForStep(expectedStep.index);
  if (networkDivergences.length > 0) {
    matched = false;
  }

  if (liveObservables.domSnapshotHash !== expectedStep.observables.domSnapshotHash) {
    matched = false;
    recordableDivergences.push({
      step: expectedStep.index,
      type: "dom_mismatch",
      expected: expectedStep.observables.domSnapshotHash,
      actual: liveObservables.domSnapshotHash,
    });
  }

  if (liveObservables.accessibilityHash !== expectedStep.observables.accessibilityHash) {
    matched = false;
    recordableDivergences.push({
      step: expectedStep.index,
      type: "accessibility_mismatch",
      expected: expectedStep.observables.accessibilityHash,
      actual: liveObservables.accessibilityHash,
    });
  }

  if (liveObservables.networkDigest !== expectedStep.observables.networkDigest) {
    matched = false;
    recordableDivergences.push({
      step: expectedStep.index,
      type: "network_digest_mismatch",
      expected: expectedStep.observables.networkDigest,
      actual: liveObservables.networkDigest,
    });
  }

  if (
    options.compareScreenshots &&
    liveObservables.screenshotHash !== expectedStep.observables.screenshotHash
  ) {
    recordableDivergences.push({
      step: expectedStep.index,
      type: "screenshot_mismatch",
      details: "screenshot hash mismatch (advisory)",
      expected: expectedStep.observables.screenshotHash,
      actual: liveObservables.screenshotHash,
    });
  }

  return {
    liveObservables,
    stepDivergences: [...networkDivergences, ...recordableDivergences],
    recordableDivergences,
    matched,
  };
}
