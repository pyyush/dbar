import { describe, it, expect } from "vitest";
import { calculateCost } from "../cli/cost.js";

describe("calculateCost", () => {
  it("should calculate cost with output token ratio for honest cost model", () => {
    const result = calculateCost({
      networkRequestCount: 47,
      domSnapshotSizes: [4000, 8000, 12000],
      stepCount: 3,
    });

    // Tokens: sum of sizes / 4 = 24000 / 4 = 6000
    // LLM input cost: 6000 * 3 / 1_000_000 = 0.018
    // LLM output cost: (6000 * 0.15) * 15 / 1_000_000 = 900 * 15 / 1_000_000 = 0.0135
    // LLM total: 0.0315
    // Compute: 3 * 2 * 0.0000463 = 0.0002778
    // Replay compute: 3 * 2 * 0.0000463 = 0.0002778
    expect(result.estimatedTokens).toBe(6000);
    expect(result.llmCost).toBeCloseTo(0.0315, 4);
    expect(result.computeCost).toBeCloseTo(0.0002778, 6);
    expect(result.replayComputeCost).toBeCloseTo(0.0002778, 6);
    expect(result.replayCost).toBeCloseTo(result.replayComputeCost, 6);
    expect(result.totalOriginalCost).toBeCloseTo(result.llmCost + result.computeCost, 6);
    expect(result.apiSavings).toBeCloseTo(result.totalOriginalCost - result.replayComputeCost, 6);
    expect(result.apiSavingsPercent).toBeCloseTo(
      ((result.totalOriginalCost - result.replayComputeCost) / result.totalOriginalCost) * 100,
      1
    );
  });

  it("should return zero costs when capsule has no steps and no requests", () => {
    const result = calculateCost({
      networkRequestCount: 0,
      domSnapshotSizes: [],
      stepCount: 0,
    });

    expect(result.estimatedTokens).toBe(0);
    expect(result.llmCost).toBe(0);
    expect(result.computeCost).toBe(0);
    expect(result.totalOriginalCost).toBe(0);
    expect(result.replayComputeCost).toBe(0);
    expect(result.replayCost).toBe(0);
    expect(result.apiSavings).toBe(0);
    expect(result.apiSavingsPercent).toBe(0);
  });

  it("should handle single step with small DOM snapshot", () => {
    const result = calculateCost({
      networkRequestCount: 1,
      domSnapshotSizes: [400],
      stepCount: 1,
    });

    expect(result.estimatedTokens).toBe(100); // 400 / 4
    expect(result.stepCount).toBe(1);
    expect(result.networkRequestCount).toBe(1);
  });

  it("should include all fields in the breakdown", () => {
    const result = calculateCost({
      networkRequestCount: 10,
      domSnapshotSizes: [2000],
      stepCount: 2,
    });

    expect(result).toHaveProperty("estimatedTokens");
    expect(result).toHaveProperty("llmCost");
    expect(result).toHaveProperty("computeCost");
    expect(result).toHaveProperty("totalOriginalCost");
    expect(result).toHaveProperty("replayComputeCost");
    expect(result).toHaveProperty("replayCost");
    expect(result).toHaveProperty("apiSavings");
    expect(result).toHaveProperty("apiSavingsPercent");
    expect(result).toHaveProperty("stepCount");
    expect(result).toHaveProperty("networkRequestCount");
  });
});
