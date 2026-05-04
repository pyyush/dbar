import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { deserializeCapsuleArchive } from "../capsule/builder.js";
import { validateCapsule } from "../capsule/validator.js";
import { buildPerformanceFixtureArchive, createPerformanceFixture } from "./helpers/performance-fixture.js";

const budgets = {
  bundleRawBytes: 280_000,
  bundleGzipBytes: 80_000,
  capsuleSerializedBytes: 700_000,
  captureOverheadPerStepMs: 200,
  replayValidationMsPerStep: 50,
  heapDeltaBytes: 24 * 1024 * 1024,
};

function distFile(path: string): Buffer | undefined {
  if (!existsSync(path)) return undefined;
  const stats = statSync(path);
  if (!stats.isFile()) return undefined;
  return readFileSync(path);
}

describe("performance budgets", () => {
  it("shouldExposeProductionShapedFixtureForTask12Budgets", () => {
    const fixture = createPerformanceFixture();

    expect(fixture.steps.length).toBeGreaterThan(1);
    expect(fixture.networkTranscript.entries.length).toBeGreaterThan(1);
    expect(fixture.artifacts.size).toBe(fixture.steps.length);
  });

  it("keeps the production-shaped capsule within 1.0.0 size and capture budgets", () => {
    const result = buildPerformanceFixtureArchive();

    expect(result.archive.manifest.steps).toHaveLength(4);
    expect(result.archive.manifest.networkTranscript.entries.length).toBeGreaterThanOrEqual(4);
    expect(result.archive.manifest.metrics.capsuleSizeBytes).toBeLessThanOrEqual(
      budgets.capsuleSerializedBytes
    );
    expect(result.capsuleSizeBytes).toBeLessThanOrEqual(budgets.capsuleSerializedBytes);
    expect(result.captureOverheadPerStepMs).toBeLessThanOrEqual(budgets.captureOverheadPerStepMs);
    expect(result.heapDeltaBytes).toBeLessThanOrEqual(budgets.heapDeltaBytes);
  });

  it("keeps replay validation latency within the hermetic per-step budget", () => {
    const result = buildPerformanceFixtureArchive();
    const started = performance.now();
    const archive = deserializeCapsuleArchive(result.serialized);
    const validation = validateCapsule(archive);
    const elapsedMs = performance.now() - started;
    const perStepMs = elapsedMs / archive.manifest.steps.length;

    expect(validation.valid).toBe(true);
    expect(perStepMs).toBeLessThanOrEqual(budgets.replayValidationMsPerStep);
  });

  it("keeps built package artifacts within the 1.0.0 bundle budget after build", () => {
    const esm = distFile("dist/index.js");
    const cjs = distFile("dist/index.cjs");

    expect(esm, "run npm run build before enforcing bundle budgets").toBeDefined();
    expect(cjs, "run npm run build before enforcing bundle budgets").toBeDefined();

    for (const artifact of [esm!, cjs!]) {
      expect(artifact.byteLength).toBeLessThanOrEqual(budgets.bundleRawBytes);
      expect(gzipSync(artifact).byteLength).toBeLessThanOrEqual(budgets.bundleGzipBytes);
    }
  });
});
