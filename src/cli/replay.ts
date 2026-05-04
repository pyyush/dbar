/**
 * Replay command: load a capsule from disk, replay it in a browser,
 * and output results (optionally with cost comparison).
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { deserializeCapsuleArchive } from "../capsule/builder.js";
import { DBAR } from "../sdk.js";
import { calculateCost, type CostBreakdown } from "./cost.js";
import { countFailedSteps, isBlockingDivergence } from "../replay/compare.js";
import type { Divergence } from "../capsule/types.js";

function getFirstDivergence(divergences: Divergence[], timeToDivergence?: number): Divergence | undefined {
  if (timeToDivergence !== undefined) {
    return divergences.find((divergence) => divergence.step === timeToDivergence) ?? divergences[0];
  }

  return divergences.reduce<Divergence | undefined>((earliest, divergence) => {
    if (!earliest || divergence.step < earliest.step) {
      return divergence;
    }
    return earliest;
  }, undefined);
}

/**
 * Run a capsule replay and print results to stdout.
 *
 * @param capsulePath - Path to a serialized `.capsule` file on disk.
 * @param options - CLI flags: `--cost` for cost comparison, `--json` for JSON output.
 * @throws {Error} If the file cannot be read or the capsule is malformed.
 */
export async function runReplay(
  capsulePath: string,
  options: { cost?: boolean; json?: boolean }
): Promise<void> {
  const raw = await readFile(capsulePath, "utf-8");
  const archive = deserializeCapsuleArchive(raw);

  // Dynamically import playwright-core to launch a browser for replay
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    const result = await DBAR.replay(page, archive);
    const capsule = archive.manifest;
    const fileName = basename(capsulePath);
    const failedSteps = countFailedSteps(result.divergences);
    const successCount = capsule.steps.length - failedSteps;
    const firstDivergence = getFirstDivergence(result.divergences, result.timeToDivergence);
    const firstBlockingDivergence = result.divergences.find(isBlockingDivergence);

    let costBreakdown: CostBreakdown | undefined;
    if (options.cost) {
      const domSnapshotSizes: number[] = [];
      for (const step of capsule.steps) {
        const domBuffer = archive.files.get(step.artifacts.domSnapshot);
        domSnapshotSizes.push(domBuffer ? domBuffer.byteLength : 0);
      }

      costBreakdown = calculateCost({
        networkRequestCount: capsule.networkTranscript.entries.length,
        domSnapshotSizes,
        stepCount: capsule.steps.length,
      });
    }

    if (options.json) {
      const output: Record<string, unknown> = {
        capsule: fileName,
        steps: capsule.steps.length,
        successCount,
        totalSteps: capsule.steps.length,
        successRate: result.replaySuccessRate,
        replaySuccessRate: result.replaySuccessRate,
        determinismViolationRate: result.determinismViolationRate,
        durationMs: result.overheadMs,
        success: result.success,
        failedStepCount: failedSteps,
        timeToDivergence: result.timeToDivergence ?? null,
        firstDivergence: firstDivergence ?? null,
        firstBlockingDivergence: firstBlockingDivergence ?? null,
        divergences: result.divergences,
      };
      if (costBreakdown) {
        output.cost = costBreakdown;
      }
      process.stdout.write(JSON.stringify(output, null, 2) + "\n");
    } else {
      const pct =
        capsule.steps.length > 0
          ? ((successCount / capsule.steps.length) * 100).toFixed(0)
          : "100";
      const duration = (result.overheadMs / 1000).toFixed(2);

      const lines: string[] = [
        "DBAR Replay Results",
        "\u2550".repeat(19),
        `Capsule:     ${fileName}`,
        `Steps:       ${capsule.steps.length}`,
        `Success:     ${successCount}/${capsule.steps.length} (${pct}%)`,
        `Duration:    ${duration}s`,
        `Blocking:    ${failedSteps} failed step${failedSteps === 1 ? "" : "s"}`,
        (firstBlockingDivergence ?? firstDivergence)
          ? `First ${firstBlockingDivergence ? "blocking " : ""}divergence: step ${(firstBlockingDivergence ?? firstDivergence)!.step} (${(firstBlockingDivergence ?? firstDivergence)!.type})`
          : "First divergence: none",
      ];

      if (costBreakdown) {
        lines.push(
          "",
          "Cost Comparison",
          "\u2500".repeat(15),
          `Original run:  $${costBreakdown.totalOriginalCost.toFixed(2)}`,
          `  LLM tokens:  $${costBreakdown.llmCost.toFixed(2)} (${costBreakdown.estimatedTokens.toLocaleString()} tokens)`,
          `  Network:     ${costBreakdown.networkRequestCount} requests`,
          `  Compute:     $${costBreakdown.computeCost.toFixed(2)}`,
          "",
          `Replay cost (API):     $0.00`,
          `Replay cost (compute): $${costBreakdown.replayComputeCost.toFixed(2)}`,
          `API savings:   $${costBreakdown.apiSavings.toFixed(2)} (${costBreakdown.apiSavingsPercent.toFixed(1)}%)`
        );
      }

      process.stdout.write(lines.join("\n") + "\n");
    }

    if (!result.success) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}
