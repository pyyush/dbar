/**
 * Cost estimation for DBAR replay savings.
 *
 * Compares the estimated cost of an original browser agent run (LLM tokens +
 * compute) against a deterministic replay (which costs $0 — all network is
 * mocked, no LLM calls, local browser only).
 */

/** Input data extracted from a capsule for cost estimation. */
export interface CostInput {
  /** Total number of network requests in the capsule transcript. */
  networkRequestCount: number;
  /** Byte sizes of each step's DOM snapshot (used to estimate LLM token count). */
  domSnapshotSizes: number[];
  /** Number of steps in the capsule. */
  stepCount: number;
}

/** Itemized cost breakdown comparing original run vs. replay. */
export interface CostBreakdown {
  /** Estimated LLM token count (sum of DOM snapshot chars / 4). */
  estimatedTokens: number;
  /** Estimated LLM API cost in USD (input + output at Claude Sonnet rates). */
  llmCost: number;
  /** Estimated browser compute cost in USD (stepCount * 2s * vCPU rate). */
  computeCost: number;
  /** Total estimated original run cost in USD. */
  totalOriginalCost: number;
  /** Replay cost — always $0.00. */
  replayCost: number;
  /** Dollar savings (totalOriginalCost - replayCost). */
  savings: number;
  /** Number of steps (pass-through for display). */
  stepCount: number;
  /** Number of network requests (pass-through for display). */
  networkRequestCount: number;
}

// Claude Sonnet pricing (USD per token)
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

// Cloud browser compute: ~$0.0000463 per vCPU-second
const VCPU_COST_PER_SECOND = 0.0000463;

// Estimated seconds of compute per step
const SECONDS_PER_STEP = 2;

/**
 * Calculate cost comparison between an original browser agent run and a
 * deterministic replay from a capsule.
 *
 * @param input - Capsule metrics needed for cost estimation.
 * @returns Itemized {@link CostBreakdown} with original vs. replay costs.
 *
 * @example
 * ```ts
 * const breakdown = calculateCost({
 *   networkRequestCount: 47,
 *   domSnapshotSizes: [4000, 8000],
 *   stepCount: 2,
 * });
 * console.log(`Savings: $${breakdown.savings.toFixed(2)}`);
 * ```
 */
export function calculateCost(input: CostInput): CostBreakdown {
  const totalChars = input.domSnapshotSizes.reduce((sum, size) => sum + size, 0);
  const estimatedTokens = Math.floor(totalChars / 4);

  const llmCost =
    estimatedTokens * INPUT_COST_PER_TOKEN + estimatedTokens * OUTPUT_COST_PER_TOKEN;
  const computeCost = input.stepCount * SECONDS_PER_STEP * VCPU_COST_PER_SECOND;
  const totalOriginalCost = llmCost + computeCost;

  return {
    estimatedTokens,
    llmCost,
    computeCost,
    totalOriginalCost,
    replayCost: 0,
    savings: totalOriginalCost,
    stepCount: input.stepCount,
    networkRequestCount: input.networkRequestCount,
  };
}
