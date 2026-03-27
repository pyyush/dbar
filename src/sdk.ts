import type { Page, CDPSession } from "playwright-core";

import type {
  StepSnapshot,
  ReplayResult,
  ValidationResult,
  Divergence,
  StepObservables,
  NetworkTranscript,
  NetworkEntry,
} from "./capsule/types.js";
import {
  buildCapsule,
  serializeCapsuleArchive,
  deserializeCapsuleArchive,
  type CapsuleBuildInput,
  type CapsuleArchive,
} from "./capsule/builder.js";
import { validateCapsule } from "./capsule/validator.js";
import { Coordinator, type CaptureOptions, type CaptureSessionState } from "./coordinator.js";
import { NetworkReplayer } from "./network/replayer.js";
import { TimeVirtualizer } from "./time/virtualizer.js";
import { captureDOMSnapshot } from "./snapshot/dom.js";
import { captureAccessibilitySnapshot } from "./snapshot/accessibility.js";
import { captureScreenshot } from "./snapshot/screenshot.js";
import { restoreStorageState } from "./snapshot/state.js";
import { TraceTimeline } from "./telemetry/trace.js";

// ---------------------------------------------------------------------------
// Transcript hydration — resolve deduplicated body paths to base64 content
// ---------------------------------------------------------------------------

/**
 * buildCapsule deduplicates response bodies into `network/<hash>` files and
 * replaces `entry.response.body` with the file path. Before replay, we need
 * to resolve those paths back to actual base64 content so the NetworkReplayer
 * can serve them via Fetch.fulfillRequest.
 */
function hydrateTranscript(
  transcript: NetworkTranscript,
  files: Map<string, Buffer>
): NetworkTranscript {
  const entries: NetworkEntry[] = transcript.entries.map((entry) => {
    if (!entry.response) return entry;

    const bodyRef = entry.response.body;
    // If the body looks like a file path (network/<hash>), resolve it
    if (bodyRef.startsWith("network/") && files.has(bodyRef)) {
      const bodyBuffer = files.get(bodyRef)!;
      return {
        ...entry,
        response: {
          ...entry.response,
          body: bodyBuffer.toString("base64"),
        },
      };
    }
    return entry;
  });

  return { orderingPolicy: transcript.orderingPolicy, entries };
}

// ---------------------------------------------------------------------------
// Capture Session
// ---------------------------------------------------------------------------

/**
 * A live capture session wrapping the Coordinator. Provides step(), finish(),
 * and abort() methods for the caller to drive capture boundaries.
 *
 * @example
 * ```ts
 * const session = await DBAR.capture(page);
 * await session.step("after-login");
 * await session.step("after-click");
 * const archive = await session.finish();
 * ```
 */
export class CaptureSession {
  private state: CaptureSessionState;
  private finished = false;

  /** @internal — use {@link DBAR.capture} to create. */
  constructor(state: CaptureSessionState) {
    this.state = state;
  }

  /** The unique session ID. */
  get id(): string {
    return this.state.id;
  }

  /** Number of steps captured so far. */
  get stepCount(): number {
    return this.state.stepIndex;
  }

  /**
   * Execute a step boundary — pauses time, waits for quiescence, captures
   * all observables, and resumes time.
   *
   * @param label - Optional human-readable label for this step
   * @returns Snapshot with observable hashes and timing
   */
  async step(label?: string): Promise<StepSnapshot> {
    if (this.finished) throw new Error("Session already finished or aborted");
    return Coordinator.step(this.state, label);
  }

  /**
   * Finish the capture session, stop all subsystems, and build a
   * {@link CapsuleArchive} from the recorded data.
   *
   * @returns The assembled capsule archive ready for validation/transport
   */
  async finish(): Promise<CapsuleArchive> {
    if (this.finished) throw new Error("Session already finished or aborted");
    this.finished = true;

    // Stop subsystems
    await this.state.recorder.stop();
    if (this.state.timeVirtualizerStarted) {
      await this.state.timeVirtualizer.stop();
    }
    this.state.trace.recordSession("capture_finish");

    // Get recorded network transcript
    const transcript = await Coordinator.getTranscript(this.state);

    const input: CapsuleBuildInput = {
      environment: this.state.environment,
      seeds: this.state.seeds,
      initialState: this.state.initialState,
      networkTranscript: {
        orderingPolicy: "creation",
        entries: transcript.entries,
      },
      steps: this.state.steps,
      artifacts: this.state.artifacts,
      captureStartTime: this.state.startTime,
    };

    return buildCapsule(input);
  }

  /**
   * Abort the capture session without producing a capsule.
   * Cleans up CDP listeners and subsystem state.
   */
  async abort(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await Coordinator.abort(this.state);
  }
}

// ---------------------------------------------------------------------------
// Replay Options
// ---------------------------------------------------------------------------

/** Options for {@link DBAR.replay} and {@link DBAR.startReplay}. */
export interface ReplayOptions {
  /** Policy for requests not found in the transcript (default: "block"). */
  unmatchedRequestPolicy?: "block" | "continue";
  /** Virtual time budget per step in ms (default: 10000). */
  stepBudgetMs?: number;
  /** CSS selectors of dynamic content to mask in screenshots. */
  screenshotMasks?: string[];
  /** Compare screenshotHash during replay (default: false — captured but not compared in v1). */
  compareScreenshots?: boolean;
}

// ---------------------------------------------------------------------------
// Replay Session (step-by-step replay for multi-step capsules)
// ---------------------------------------------------------------------------

/** Per-step result returned by {@link ReplaySession.step}. */
export interface ReplayStepResult {
  index: number;
  matched: boolean;
  divergences: Divergence[];
  liveObservables: StepObservables;
  expectedObservables: StepObservables;
}

/**
 * Internal state for an active replay session.
 * @internal
 */
interface ReplaySessionState {
  page: Page;
  cdpSession: CDPSession;
  archive: CapsuleArchive;
  options: ReplayOptions;
  replayer: NetworkReplayer;
  timeVirtualizer: TimeVirtualizer;
  timeVirtualizerStarted: boolean;
  trace: TraceTimeline;
  divergences: Divergence[];
  stepIndex: number;
  matchedSteps: number;
  timeToDivergence: number | undefined;
  startTime: number;
}

/**
 * A step-by-step replay session for multi-step capsules.
 *
 * Unlike {@link DBAR.replay} which runs all steps automatically, a
 * ReplaySession lets the caller interleave user actions (navigation,
 * clicks) between step comparisons — matching what happened during capture.
 *
 * @example
 * ```ts
 * const rs = await DBAR.startReplay(page, archive);
 * await page.goto("https://example.com");
 * const r0 = await rs.step(); // compares against capsule step 0
 * await page.click("a.nav");
 * const r1 = await rs.step(); // compares against capsule step 1
 * const result = await rs.finish();
 * ```
 */
export class ReplaySession {
  private state: ReplaySessionState;
  private finished = false;

  /** @internal — use {@link DBAR.startReplay} to create. */
  constructor(state: ReplaySessionState) {
    this.state = state;
  }

  /** Number of steps compared so far. */
  get stepCount(): number {
    return this.state.stepIndex;
  }

  /** Total steps in the capsule. */
  get totalSteps(): number {
    return this.state.archive.manifest.steps.length;
  }

  /**
   * Compare the current live page state against the next expected capsule step.
   * Call this after performing the same user action that preceded this step
   * during capture.
   *
   * @returns Per-step comparison result
   */
  async step(): Promise<ReplayStepResult> {
    if (this.finished) throw new Error("Replay session already finished");
    const { state } = this;
    const capsule = state.archive.manifest;
    const expectedStep = capsule.steps[state.stepIndex];
    if (!expectedStep) throw new Error(`No more steps in capsule (have ${capsule.steps.length})`);

    const stepDivergences: Divergence[] = [];

    state.replayer.setStepIndex(expectedStep.index);

    // Start virtual time on first step (deferred from startReplay to avoid
    // blocking page.goto with networkidle)
    if (!state.timeVirtualizerStarted) {
      await state.timeVirtualizer.start();
      state.timeVirtualizerStarted = true;
    }

    // Pause time, wait for quiescence
    await state.timeVirtualizer.pause();
    const { quiescent } = await state.timeVirtualizer.waitForQuiescence();
    if (!quiescent) {
      const d: Divergence = { step: expectedStep.index, type: "quiescence_timeout" };
      stepDivergences.push(d);
      state.divergences.push(d);
    }

    // Capture live observables
    const [domResult, a11yResult, screenshotResult] = await Promise.all([
      captureDOMSnapshot(state.cdpSession),
      captureAccessibilitySnapshot(state.page, state.cdpSession),
      captureScreenshot(state.page, { masks: state.options.screenshotMasks }),
    ]);

    const liveObservables: StepObservables = {
      domSnapshotHash: domResult.hash,
      accessibilityHash: a11yResult.hash,
      screenshotHash: screenshotResult.hash,
      networkDigest: expectedStep.observables.networkDigest,
    };

    // Compare observables
    let stepDiverged = false;

    if (liveObservables.domSnapshotHash !== expectedStep.observables.domSnapshotHash) {
      stepDiverged = true;
      const d: Divergence = {
        step: expectedStep.index,
        type: "dom_mismatch",
        expected: expectedStep.observables.domSnapshotHash,
        actual: liveObservables.domSnapshotHash,
      };
      stepDivergences.push(d);
      state.divergences.push(d);
    }

    if (liveObservables.accessibilityHash !== expectedStep.observables.accessibilityHash) {
      stepDiverged = true;
      const d: Divergence = {
        step: expectedStep.index,
        type: "accessibility_mismatch",
        expected: expectedStep.observables.accessibilityHash,
        actual: liveObservables.accessibilityHash,
      };
      stepDivergences.push(d);
      state.divergences.push(d);
    }

    if (
      state.options.compareScreenshots &&
      liveObservables.screenshotHash !== expectedStep.observables.screenshotHash
    ) {
      const d: Divergence = {
        step: expectedStep.index,
        type: "screenshot_mismatch",
        details: "screenshot hash mismatch (advisory)",
        expected: expectedStep.observables.screenshotHash,
        actual: liveObservables.screenshotHash,
      };
      stepDivergences.push(d);
      state.divergences.push(d);
    }

    if (!stepDiverged) {
      state.matchedSteps++;
    } else if (state.timeToDivergence === undefined) {
      state.timeToDivergence = expectedStep.index;
    }

    state.trace.recordSnapshot(expectedStep.index, liveObservables);

    // Suspend virtual time (advance mode) so navigation works between steps
    await state.timeVirtualizer.suspend();
    state.stepIndex++;

    return {
      index: expectedStep.index,
      matched: !stepDiverged,
      divergences: stepDivergences,
      liveObservables,
      expectedObservables: expectedStep.observables,
    };
  }

  /**
   * Finish the replay session and compute final metrics.
   * Must be called after all steps have been compared (or early if aborting).
   */
  async finish(): Promise<ReplayResult> {
    if (this.finished) throw new Error("Replay session already finished");
    this.finished = true;
    const { state } = this;

    // Collect replayer divergences
    const replayerDivergences = state.replayer.getDivergences();
    if (state.timeToDivergence === undefined && replayerDivergences.length > 0) {
      state.timeToDivergence = replayerDivergences[0]!.step;
    }

    // Cleanup
    await state.replayer.stop();
    if (state.timeVirtualizerStarted) {
      await state.timeVirtualizer.stop();
    }
    state.trace.recordSession("replay_finish");

    // Compute metrics
    const totalSteps = state.archive.manifest.steps.length;
    const replaySuccessRate = totalSteps > 0 ? state.matchedSteps / totalSteps : 1;
    const determinismViolationRate = totalSteps > 0 ? 1 - replaySuccessRate : 0;

    return {
      success: state.divergences.length === 0,
      replaySuccessRate,
      determinismViolationRate,
      timeToDivergence: state.timeToDivergence,
      divergences: state.divergences,
      overheadMs: Date.now() - state.startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// DBAR Static API
// ---------------------------------------------------------------------------

/**
 * DBAR — Deterministic Browser Agent Runtime.
 *
 * High-level entry point for capture, replay, and validation.
 *
 * @example
 * ```ts
 * // Capture
 * const session = await DBAR.capture(page);
 * await page.goto("https://example.com");
 * await session.step("step-0");
 * const archive = await session.finish();
 *
 * // Step-by-step replay (for multi-step capsules)
 * const rs = await DBAR.startReplay(replayPage, archive);
 * await replayPage.goto("https://example.com");
 * const r0 = await rs.step();
 * const result = await rs.finish();
 *
 * // Auto-replay (single-step capsules only)
 * const result2 = await DBAR.replay(page, archive);
 * ```
 */
export class DBAR {
  private constructor() {
    // Static-only class
  }

  /**
   * Start a capture session on a Playwright page.
   *
   * @param page - Playwright Page to record
   * @param options - Seed overrides, time budget, and masking options
   * @returns A {@link CaptureSession} with step()/finish()/abort() methods
   */
  static async capture(page: Page, options?: CaptureOptions): Promise<CaptureSession> {
    const state = await Coordinator.startCapture(page, options);
    return new CaptureSession(state);
  }

  /**
   * Start a step-by-step replay session. Use this for multi-step capsules
   * where you need to interleave user actions between step comparisons.
   *
   * Sets up network interception and virtual time BEFORE restoring initial
   * state, so the initial page load is served from the recorded transcript.
   *
   * @param page - Playwright Page for replay (should be a fresh page)
   * @param archive - The capsule archive to replay
   * @param options - Replay configuration
   * @returns A {@link ReplaySession} with step()/finish() methods
   */
  static async startReplay(
    page: Page,
    archive: CapsuleArchive,
    options: ReplayOptions = {}
  ): Promise<ReplaySession> {
    const capsule = archive.manifest;
    const divergences: Divergence[] = [];
    const trace = new TraceTimeline();
    trace.recordSession("replay_start", { capsuleId: capsule.id });

    // Set up CDP session + subsystems BEFORE initial navigation
    const cdpSession: CDPSession = await page.context().newCDPSession(page);

    const timeVirtualizer = new TimeVirtualizer(cdpSession, {
      stepBudgetMs: options.stepBudgetMs ?? 10000,
      initialVirtualTime: capsule.seeds.initialTime,
    });

    // Hydrate transcript: resolve deduplicated body paths to actual base64
    const hydrated = hydrateTranscript(capsule.networkTranscript, archive.files);

    const replayer = new NetworkReplayer(cdpSession, hydrated, {
      unmatchedRequestPolicy: options.unmatchedRequestPolicy ?? "block",
      onDivergence: (d) => divergences.push(d),
      onFetchResolved: () => timeVirtualizer.trackFetchResolution(),
    });

    // Start network interception (but NOT virtual time — that's deferred to
    // first step() to avoid blocking page.goto with networkidle)
    await replayer.start();

    // Restore cookies/localStorage then navigate to initial URL
    await restoreStorageState(page, capsule.initialState);

    return new ReplaySession({
      page,
      cdpSession,
      archive,
      options,
      replayer,
      timeVirtualizer,
      timeVirtualizerStarted: false,
      trace,
      divergences,
      stepIndex: 0,
      matchedSteps: 0,
      timeToDivergence: undefined,
      startTime: Date.now(),
    });
  }

  /**
   * Auto-replay a captured session, comparing all steps sequentially.
   *
   * **Note:** This method does not replay user actions between steps. It works
   * well for single-step capsules. For multi-step capsules, use
   * {@link DBAR.startReplay} to interleave actions between step comparisons.
   *
   * @param page - Playwright Page for replay (should be a fresh page)
   * @param archive - The capsule archive to replay
   * @param options - Replay configuration
   * @returns Replay metrics and divergence details
   */
  static async replay(
    page: Page,
    archive: CapsuleArchive,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    const capsule = archive.manifest;
    const divergences: Divergence[] = [];
    const trace = new TraceTimeline();
    const startTime = Date.now();
    trace.recordSession("replay_start", { capsuleId: capsule.id });

    // Set up CDP + subsystems BEFORE navigation (fix: interception must be
    // active when restoreStorageState navigates to the initial URL)
    const cdpSession: CDPSession = await page.context().newCDPSession(page);

    const timeVirtualizer = new TimeVirtualizer(cdpSession, {
      stepBudgetMs: options.stepBudgetMs ?? 10000,
      initialVirtualTime: capsule.seeds.initialTime,
    });

    const hydrated = hydrateTranscript(capsule.networkTranscript, archive.files);

    const replayer = new NetworkReplayer(cdpSession, hydrated, {
      unmatchedRequestPolicy: options.unmatchedRequestPolicy ?? "block",
      onDivergence: (d) => divergences.push(d),
      onFetchResolved: () => timeVirtualizer.trackFetchResolution(),
    });

    await replayer.start();
    // TimeVirtualizer deferred to first step (same as capture)

    // Restore initial state (navigation goes through replayer's transcript)
    await restoreStorageState(page, capsule.initialState);

    // Replay each step
    let matchedSteps = 0;
    let timeToDivergence: number | undefined;
    let tvStarted = false;

    for (const expectedStep of capsule.steps) {
      replayer.setStepIndex(expectedStep.index);

      if (!tvStarted) {
        await timeVirtualizer.start();
        tvStarted = true;
      }
      await timeVirtualizer.pause();
      const { quiescent } = await timeVirtualizer.waitForQuiescence();
      if (!quiescent) {
        divergences.push({ step: expectedStep.index, type: "quiescence_timeout" });
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
        networkDigest: expectedStep.observables.networkDigest,
      };

      let stepDiverged = false;

      if (liveObservables.domSnapshotHash !== expectedStep.observables.domSnapshotHash) {
        stepDiverged = true;
        divergences.push({
          step: expectedStep.index,
          type: "dom_mismatch",
          expected: expectedStep.observables.domSnapshotHash,
          actual: liveObservables.domSnapshotHash,
        });
      }

      if (liveObservables.accessibilityHash !== expectedStep.observables.accessibilityHash) {
        stepDiverged = true;
        divergences.push({
          step: expectedStep.index,
          type: "accessibility_mismatch",
          expected: expectedStep.observables.accessibilityHash,
          actual: liveObservables.accessibilityHash,
        });
      }

      if (
        options.compareScreenshots &&
        liveObservables.screenshotHash !== expectedStep.observables.screenshotHash
      ) {
        divergences.push({
          step: expectedStep.index,
          type: "dom_mismatch",
          details: "screenshot hash mismatch (advisory)",
          expected: expectedStep.observables.screenshotHash,
          actual: liveObservables.screenshotHash,
        });
      }

      if (!stepDiverged) {
        matchedSteps++;
      } else if (timeToDivergence === undefined) {
        timeToDivergence = expectedStep.index;
      }

      trace.recordSnapshot(expectedStep.index, liveObservables);
      await timeVirtualizer.suspend();
    }

    const replayerDivergences = replayer.getDivergences();
    if (timeToDivergence === undefined && replayerDivergences.length > 0) {
      timeToDivergence = replayerDivergences[0]!.step;
    }

    await replayer.stop();
    if (tvStarted) {
      await timeVirtualizer.stop();
    }
    trace.recordSession("replay_finish");

    const totalSteps = capsule.steps.length;
    const replaySuccessRate = totalSteps > 0 ? matchedSteps / totalSteps : 1;
    const determinismViolationRate = totalSteps > 0 ? 1 - replaySuccessRate : 0;

    return {
      success: divergences.length === 0,
      replaySuccessRate,
      determinismViolationRate,
      timeToDivergence,
      divergences,
      overheadMs: Date.now() - startTime,
    };
  }

  /**
   * Validate a capsule archive for structural integrity and consistency.
   *
   * @param archive - The capsule archive to validate
   * @returns Validation result with errors and warnings
   */
  static validate(archive: CapsuleArchive): ValidationResult {
    return validateCapsule(archive);
  }

  /**
   * Convenience: validate a capsule from a serialized base64 blob.
   *
   * @param base64 - Serialized archive blob from {@link serializeCapsuleArchive}
   * @returns Validation result
   */
  static validateFromBlob(base64: string): ValidationResult {
    const archive = deserializeCapsuleArchive(base64);
    return validateCapsule(archive);
  }

  /**
   * Serialize a capsule archive to a base64 string for transport.
   */
  static serialize(archive: CapsuleArchive): string {
    return serializeCapsuleArchive(archive);
  }

  /**
   * Deserialize a capsule archive from a base64 string.
   */
  static deserialize(base64: string): CapsuleArchive {
    return deserializeCapsuleArchive(base64);
  }
}
