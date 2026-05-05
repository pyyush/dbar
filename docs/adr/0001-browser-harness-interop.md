# ADR 0001: Browser-Harness Interop For 1.0.0

## Status

Accepted for the 1.0.0 release plan.

## Context

`browser-harness` sits near DBAR's browser-agent domain, but it is a live
execution harness. DBAR's current product wedge is narrower: failed run,
replay, first divergence, reusable regression artifact.

The browser-harness research deliverable recommended optional interop for DBAR
and learn-from/no-dependency treatment for the adjacent browser projects. The
release plan keeps that recommendation because taking browser-harness as a
dependency or backend would broaden DBAR into orchestration before the proof
artifact contract is finished.

## Decision

For DBAR 1.0.0:

- Do not add `browser-harness` as a dependency.
- Do not add a browser-harness backend.
- Do not add browser-harness to release gates or CI matrices.
- Document browser-harness as an optional live runner only.
- Allow examples where an application-owned harness executes the live workflow
  while DBAR captures proof around a Chromium/CDP Playwright `Page` that DBAR
  owns or can safely attach to.

## Consequences

DBAR stays focused on replayable proof. Users who already run
browser-harness can keep it as their workflow runner, but DBAR does not inherit
its browser support, API stability, dependencies, or security model.

Revisit this decision only if browser-harness exposes a stable, minimal,
Chromium/CDP page attachment surface with clear semver discipline and the
integration can be tested without making browser-harness part of DBAR's release
gate.
