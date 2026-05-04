<p align="center">
  <img src="https://raw.githubusercontent.com/pyyush/dbar/main/.github/banners/05-replay-arrows.svg" alt="DBAR — Deterministic Browser Agent Runtime" width="800"/>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@pyyush/dbar"><img src="https://img.shields.io/npm/v/@pyyush/dbar?color=0a0a0a&labelColor=0a0a0a&label=npm" alt="npm version"></a>
  <a href="https://github.com/pyyush/dbar/actions/workflows/ci.yml"><img src="https://github.com/pyyush/dbar/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/pyyush/dbar/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-0a0a0a?labelColor=0a0a0a" alt="License"></a>
  <img src="https://img.shields.io/node/v/@pyyush/dbar?color=0a0a0a&labelColor=0a0a0a&label=node" alt="Node version">
  <img src="https://img.shields.io/badge/TypeScript-strict-0a0a0a?labelColor=0a0a0a" alt="TypeScript strict">
</p>

**Replayable proof for production browser agents.**

For browser-agent and automation teams, DBAR turns failed Chromium/CDP runs into portable **capsules** you can replay, verify, and keep as regression artifacts.

If a browser workflow flakes in CI or fails in production, DBAR helps you answer:

- What actually happened?
- Can I replay it?
- Where did it diverge first?

DBAR is for teams that need more than logs, screenshots, or trace playback. It captures deterministic time, recorded network, and hashed page state so the run itself becomes an artifact.

## Choose Your Lane

| Lane | Use this when | What you get | Docs |
|------|---------------|--------------|------|
| Playwright SDK | DBAR owns a Chromium/CDP browser session directly | Deterministic capture, replay, and first-divergence detection within DBAR's current support boundaries | This README |
| `browser-use` integration | Your workflow already runs in `browser-use` and you need step-level evidence | Snapshot, diff, and audit-trail guidance for Python/browser-use flows; DBAR does not ship a `browser-use` Python extra while upstream pins audit vulnerable | [python/README.md](./python/README.md), [integrations/browser-use/README.md](./integrations/browser-use/README.md) |
| Browserbase integration | You want DBAR to own a Browserbase-hosted Chromium/CDP session | First-class cloud capture and local replay lane with DBAR deterministic controls (`@browserbasehq/sdk` 2.9.0) | [integrations/browserbase/README.md](./integrations/browserbase/README.md) |

## Install

For deterministic capture and replay with Chromium/CDP Playwright sessions:

```bash
npm install @pyyush/dbar playwright-core
```

For Python evidence capsules and run diffing:

```bash
python3 -m pip install -e "./python"
```

Use the npm package for the full replay engine. Use the Python package when
your workflow already lives in `browser-use` and you want low-friction
recording and diffing. DBAR's Python package is duck-typed against the
browser-use hook shape and does not import or install `browser-use` at runtime.
Install and audit `browser-use` in your application environment separately.

PyPI status: as of May 4, 2026, `dbar` is not yet published on PyPI. The
`1.0.0` release path includes the first planned PyPI publication; after that
release is externally verified, the install command becomes:

```bash
pip install dbar
```

For Browserbase-hosted deterministic capture and local replay:

```bash
cd integrations/browserbase
npm install
```

## 5-Minute Quick Start

This path creates a capsule, validates it, and replays the same action boundary
from a clean project:

```bash
mkdir dbar-quickstart
cd dbar-quickstart
npm init -y
npm install @pyyush/dbar playwright
npx playwright install chromium
curl -fsSLO https://raw.githubusercontent.com/pyyush/dbar/main/examples/01-capture-validate-replay.mjs
node 01-capture-validate-replay.mjs
npx dbar validate ./artifacts/example-homepage.capsule
```

The example records a Chromium page load, writes
`./artifacts/example-homepage.capsule`, validates the archive in code, then
uses `DBAR.startReplay` to repeat the same navigation before comparing the
captured step. Use `DBAR.startReplay` for any workflow that has navigation,
clicks, typing, or other caller actions between step boundaries. The
`dbar replay` CLI is for capsules whose expected state can be compared without
interleaving actions.

## Why Use DBAR

- **Prove what a browser agent did** with a machine-checkable artifact
- **Reproduce flaky failures** without guessing from logs
- **Pinpoint the first divergence** instead of diffing a whole run manually
- **Turn failed runs into regression fixtures** you can keep and replay later
- **Share one artifact across engineering, support, and audit**

Top three questions:

| Question | Short answer |
|----------|--------------|
| Why not just keep Playwright traces? | Traces help inspect a run; DBAR gives you a replayable proof artifact with deterministic time, recorded HTTP responses, strict page-state hashes, and first-divergence reporting. |
| Why not use screenshots or session replay? | Screenshots and session replay show what was visible. DBAR verifies DOM, accessibility, and network observables and reports where the replay first stopped matching. |
| Why not depend on browser-harness? | `browser-harness` can be a live runner. DBAR stays the proof layer and intentionally keeps browser-harness out of dependencies, release gates, backends, and CI matrices for 1.0.0. |

## Integrations

- [browser-use integration](./integrations/browser-use/README.md): official DBAR integration for Python/browser-use workflows. Use it when you need step snapshots, diffs, and a durable audit trail without taking over browser ownership.
- [Browserbase integration](./integrations/browserbase/README.md): official DBAR integration for Browserbase-managed sessions. Use it when you want DBAR deterministic controls in a Chromium/CDP cloud browser lane.

## 60-Second Example

```ts
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";

const browser = await chromium.launch();
const page = await browser.newPage();
const session = await DBAR.capture(page);

await page.goto("https://example.com");
await session.step("loaded");
await page.click("a");
await session.step("after-click");

const archive = await session.finish();
const capsule = serializeCapsuleArchive(archive);
```

**Safe sharing:** DBAR capsules are full-fidelity replay artifacts and are
sensitive by default. DBAR redacts known auth headers, but cookies,
localStorage values, URL query values, response bodies, and screenshots can
still contain secrets or PII. Treat capsules like production incident evidence:
validate them, review the warnings, and share only through trusted channels. For
external sharing, re-record against scrubbed test data or explicitly accept that
the artifact is unsafe to disclose.

Replay the same boundary later:

```ts
import { DBAR, deserializeCapsuleArchive } from "@pyyush/dbar";

const archive = deserializeCapsuleArchive(capsule);
const replayPage = await browser.newPage();
const replay = await DBAR.startReplay(replayPage, archive);

await replayPage.goto("https://example.com");
const loaded = await replay.step();
await replayPage.click("a");
const afterClick = await replay.step();
const result = await replay.finish();

result.success;
result.replaySuccessRate;
result.timeToDivergence;
result.divergences;
```

## Why DBAR Instead of Traces or Session Replay

Most tools help you **observe** a browser run after the fact.

- Logs show what your code thought it did
- Screenshots show isolated moments
- Trace viewers help inspect execution
- Session replay tools show a recording

DBAR adds **verification**:

- Captures the run as a portable capsule
- Replays under deterministic controls
- Compares strict observables at each step
- Reports the first divergence with a durable artifact you can keep

If you need proof, replay, and reusable failure artifacts, DBAR is the right layer.

## What Is In A Capsule

```
capsule.json                         Manifest — environment, seeds, steps, metrics
network/<sha256>                     Deduplicated response bodies
snapshots/<step>/dom.json            Full DOM snapshot
snapshots/<step>/accessibility.json  Accessibility tree
snapshots/<step>/screenshot.png      Visual screenshot
```

Everything needed to replay the session is inside the archive.

## How It Works

DBAR controls three sources of nondeterminism at the Chromium DevTools Protocol
(CDP) level:

**1. Time**

Virtual time via `Emulation.setVirtualTimePolicy` makes `Date.now()`, timers, and animation frames deterministic.

**2. Network**

Requests and responses are recorded through the `Fetch` domain. On replay, responses are served from the capsule using `(requestHash, occurrenceIndex)` matching.

**3. State**

At each step boundary, DBAR captures the DOM snapshot, accessibility tree, and screenshot. Replay compares the live values against the recorded hashes.

## Browser Support And Limits

Deterministic capture and replay are **Chromium/CDP-only** in the current
release path. DBAR depends on Chrome DevTools Protocol controls for virtual
time, network interception, and page-state capture. Firefox and WebKit are
unsupported for deterministic replay unless a future implementation adds
equivalent browser-specific controls. There is no cross-browser CI matrix, no
browser-harness dependency, no browser-harness backend, and no browser-harness
required gate.

`@pyyush/dbar` uses `playwright-core` as a peer dependency, so it does not
install browser binaries for you. The caller must provide a Chromium-compatible
browser with CDP support:

- For local development, install a Playwright-managed Chromium binary with
  `npm install playwright` followed by `npx playwright install chromium`.
- If you intentionally use only `playwright-core`, launch an existing Chrome or
  Chromium binary by `channel` or `executablePath`.
- In CI or containers, install Chromium and its OS dependencies before running
  capture or replay.

Missing-browser errors such as "executable doesn't exist" are setup failures,
not capsule failures. Install Chromium, point Playwright at an existing
Chrome/Chromium executable, or use the Browserbase lane for hosted Chromium
capture.

Current replay boundaries:

| Surface | 1.0.0 support | How to handle it |
|---------|---------------|------------------|
| Chromium/CDP page HTTP(S) traffic | Supported within DBAR-owned Playwright sessions | Record with `DBAR.capture`; replay with `DBAR.startReplay` when actions are required. |
| WebSockets and Server-Sent Events (SSE) | Unsupported for deterministic replay | Treat as external live state; assert downstream effects separately. |
| Service workers | Unsupported as replay inputs | Disable or isolate service workers for regression capsules. |
| `sessionStorage`, IndexedDB, browser cache | Unsupported as replay inputs | Start from isolated contexts and seed app state explicitly. |
| Workers, popups, downloads, uploads, auth prompts, file pickers | Unsupported deterministic surfaces | Keep those flows outside the 1.0.0 replay contract or add a task-specific adapter. |
| Firefox and WebKit | Unsupported | Do not claim deterministic replay until equivalent browser-specific controls exist. |

## Strict vs Advisory Observables

| Observable | Strictness | What it proves |
|-----------|-----------|----------------|
| DOM snapshot hash | **Strict** | Page structure is identical |
| Accessibility tree hash | **Strict** | Semantic content is identical |
| Network digest | **Strict** | Same requests got same responses |
| Screenshot hash | Advisory | Visual appearance only |

A replay passes when the strict observables match. Screenshot differences are reported, but do not fail the replay.

## Replay Metrics

Every replay reports:

- **RSR** — Replay Success Rate
- **DVR** — Determinism Violation Rate
- **TTD** — Time to Divergence

## Performance Budgets

The 1.0.0 release gates a production-shaped fixture with four steps, HTTP
responses, DOM/accessibility snapshots, screenshots, and trace segments. The
root `npm run performance` check enforces initial budgets for package artifact
size, serialized capsule size, capture overhead per step, replay validation
latency per step, and heap growth. Large screenshots and retained response
bodies are the biggest capsule-size drivers; keep long-lived regression
capsules scoped to the smallest workflow that proves the failure.

Those three numbers let you measure whether a workflow is reproducible and where it stopped being reproducible.

Current local release evidence from the Task 14 verification pass:

- `npm run coverage` reports 69.78% line coverage across the current root test
  suite; the final 1.0.0 gate still requires the accepted core-module coverage
  threshold before release.
- `npm run performance` passes the committed performance-budget fixture.
- `npm audit` reports 0 known vulnerabilities for the root npm package.

## Debugging Failures

Use this sequence when a capsule replay fails:

1. Run `npx dbar validate <capsule>` and fix structural errors before replay.
2. Run `npx dbar replay <capsule> --json > replay.json` for capsules that do
   not require caller actions, or replay through `DBAR.startReplay` when the
   workflow needs navigation, clicks, typing, or app-specific setup.
3. Inspect `firstBlockingDivergence`, `timeToDivergence`, and the per-step
   `divergences` array before reading every snapshot manually.
4. Treat screenshot-only mismatches as advisory unless your own workflow marks
   visual drift as blocking.
5. If replay cannot launch Chromium, fix the browser installation or
   `executablePath` first; that is an environment failure, not capsule drift.

Downstream users can turn on their own structured logs around DBAR calls by
recording the capsule path, step labels, `timeToDivergence`, divergence type,
and replay result. DBAR does not enable noisy logging by default.

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for the top questions from the
1.0.0 audit.

## From Failed Run To Regression Artifact

DBAR should fit the incident loop, not sit beside it.

Use DBAR around the Playwright workflow that matters, then keep the capsule only
when the run fails or when you intentionally mark it as high-value evidence:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { DBAR, type CaptureSession, serializeCapsuleArchive } from "@pyyush/dbar";

async function withFailureCapsule(
  page: Page,
  testInfo: TestInfo,
  run: (session: CaptureSession) => Promise<void>,
) {
  const session = await DBAR.capture(page);
  let failed = false;

  try {
    await run(session);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const archive = await session.finish();
    const keepHighValueRun = process.env.DBAR_KEEP_HIGH_VALUE === "1";

    if (failed || keepHighValueRun) {
      const outputDir = path.join(testInfo.outputDir, "dbar");
      const capsulePath = path.join(outputDir, "checkout.capsule");

      await mkdir(outputDir, { recursive: true });
      await writeFile(capsulePath, serializeCapsuleArchive(archive), "utf8");
      await testInfo.attach("dbar-capsule", {
        path: capsulePath,
        contentType: "application/vnd.dbar.capsule",
      });
    }
  }
}

test("checkout submits an order", async ({ page }, testInfo) => {
  await withFailureCapsule(page, testInfo, async (session) => {
    await page.goto("https://example.com/checkout");
    await session.step("checkout-loaded");

    await page.click('[data-test="submit-order"]');
    await session.step("submit-clicked");

    await expect(page.getByText("Order confirmed")).toBeVisible();
    await session.step("order-confirmed");
  });
});
```

Validate and replay any retained capsule before filing it as a regression
artifact:

```bash
shopt -s globstar nullglob
for capsule in test-results/**/dbar/*.capsule; do
  npx dbar validate "$capsule"
  npx dbar replay "$capsule" --json > "$capsule.replay.json" || true
done
```

- `dbar replay` exits with code `1` when a blocking divergence is found
- `--json` includes `timeToDivergence`, `firstDivergence`, `firstBlockingDivergence`, and the full divergence list
- screenshot-only mismatches stay advisory, so cosmetic drift does not fail the replay
- `dbar replay` does not click, type, or navigate between captured step boundaries. For multi-step workflows that require actions between comparisons, use `DBAR.startReplay`.

In GitHub Actions, upload the retained capsule and replay JSON even when the
test job fails:

```yaml
- name: Run Playwright with DBAR failure capsules
  run: npm run test:e2e

- name: Validate and replay DBAR capsules
  if: always()
  shell: bash
  run: |
    shopt -s globstar nullglob
    for capsule in test-results/**/dbar/*.capsule; do
      npx dbar validate "$capsule"
      npx dbar replay "$capsule" --json > "$capsule.replay.json" || true
    done

- name: Upload DBAR regression artifacts
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: dbar-regression-artifacts
    path: |
      test-results/**/dbar/*.capsule
      test-results/**/dbar/*.replay.json
    if-no-files-found: ignore
```

### Optional Browser-Harness Interop

`browser-harness` can execute the live workflow, but DBAR stays the proof layer.
Do not add `browser-harness` as a DBAR dependency, backend, release gate, or CI
matrix entry. Use it only as an application-owned runner around a
Chromium/CDP Playwright session where DBAR owns the `Page` or can safely attach:

```ts
// Pseudocode: your harness owns the live script; DBAR owns the proof boundary.
const page = await openChromiumPageFromYourHarness();
await withFailureCapsule(page, testInfo, async (session) => {
  await runLiveBrowserHarnessScenario(page);
  await session.step("browser-harness-scenario-complete");
});
```

If the harness owns an unsupported browser or does not expose a safe Chromium/CDP
attachment point, keep DBAR out of that run and treat the harness output as live
execution evidence only.

## Who It Is For

- Browser agent teams shipping production workflows
- Browser automation teams fighting flaky CI and hard-to-reproduce failures
- Platform and reliability teams that need a standard artifact for browser incidents
- Audit-sensitive workflows where evidence matters after execution

## Core API

### Capture

```ts
const session = await DBAR.capture(page, {
  seeds: { initialTime: 1700000000000 },
  stepBudgetMs: 5000,
  screenshotMasks: [".ad-banner"],
});

const snap = await session.step("label");
const archive = await session.finish();
await session.abort();
```

### Replay

```ts
const result = await DBAR.replay(page, archive, {
  unmatchedRequestPolicy: "block",
  compareScreenshots: false,
});
```

`DBAR.replay` compares the capsule steps automatically. It is the right fit for
single-step capsules or workflows where no caller action is needed between step
comparisons. It does not replay user actions.

### Step-by-Step Replay

`DBAR.startReplay` is the stable multi-step replay surface for 1.0.0. It
restores the capsule's initial browser state, starts the replay controls, and
lets your code interleave the same Playwright actions that happened during
capture:

```ts
const replay = await DBAR.startReplay(page, archive, {
  unmatchedRequestPolicy: "block",
});

const loaded = await replay.step();
await page.click('[data-test="submit-order"]');
const submitted = await replay.step();

const result = await replay.finish();
```

There is no scripted CLI replay-plan format in the 1.0.0 release surface. Keep
multi-step action replay in code so the action boundaries stay explicit and
testable.

### Validate

```ts
const result = DBAR.validate(archive);
result.valid;
result.errors;
result.warnings;
```

### Serialize / Deserialize

```ts
const blob = serializeCapsuleArchive(archive);
const archive = deserializeCapsuleArchive(blob);
```

## Lower-Level APIs

Every subsystem is exported independently:

```ts
import {
  TimeVirtualizer,
  NetworkRecorder,
  NetworkReplayer,
  captureDOMSnapshot,
  captureAccessibilitySnapshot,
  captureScreenshot,
  buildCapsule,
  validateCapsule,
  DeterminismCapsuleSchema,
  CapsuleStepSchema,
} from "@pyyush/dbar";
```

Use the high-level `DBAR` API if you want the shortest path. Use the lower-level exports if you need custom integrations.

## 1.0.0 API Stability

The npm package exposes only `@pyyush/dbar` and
`@pyyush/dbar/package.json`. Deep imports from `dist/`, `src/`, test helpers,
or individual implementation files are internal and unsupported.

Stable TypeScript surface for 1.0.0:

- High-level SDK: `DBAR.capture`, `DBAR.startReplay`, `DBAR.replay`,
  `DBAR.validate`, `DBAR.validateSerialized`, `DBAR.serialize`,
  `DBAR.deserialize`, `CaptureSession`, `ReplaySession`, `ReplayOptions`, and
  `ReplayStepResult`.
- Capsule archive API: `buildCapsule`, `serializeCapsuleArchive`,
  `deserializeCapsuleArchive`, `validateCapsule`, `CapsuleBuildInput`, and
  `CapsuleArchive`.
- Capsule and replay data contracts exported from the root package:
  `DeterminismCapsule`, `EnvironmentDescriptor`, `SeedPackage`,
  `InitialState`, `NetworkEntry`, `NetworkTranscript`, `CapsuleStep`,
  `StepAction`, `StepObservables`, `StepArtifacts`, `CapsuleMetrics`,
  `CapsuleCookie`, `Divergence`, `DivergenceType`, `StepSnapshot`,
  `ReplayResult`, `ValidationResult`, and their matching Zod schemas.

Experimental TypeScript surface:

- Low-level CDP and capture primitives: `Coordinator`, `TimeVirtualizer`,
  `NetworkRecorder`, `NetworkReplayer`, `captureDOMSnapshot`,
  `captureAccessibilitySnapshot`, `captureScreenshot`, `captureStorageState`,
  `restoreStorageState`, and `TraceTimeline`.
- Network and utility helpers: `createTranscript`, `hashRequest`, `hashBody`,
  `hashBuffer`, `redactHeaders`, `isSSE`, and `isWebSocket`.

Experimental exports are available for custom integrations, but their
constructor options, emitted diagnostics, and exact implementation behavior may
change in a minor release if the stable SDK and capsule contracts remain
compatible.

Internal surfaces:

- The minimal YAML parser behind `dbar eval`.
- Redaction internals, benchmark fixtures, test helpers, and generated `dist/`
  file names.
- Any browser-harness example code. Browser-harness is optional live-runner
  interop only; it is not a DBAR dependency, backend, release gate, or CI
  matrix entry.

## CLI Stability

Stable root CLI commands for 1.0.0:

| Command | Stable contract | Exit codes |
|---------|-----------------|------------|
| `dbar replay <capsule-path> [--cost] [--json]` | Replays a serialized capsule and reports replay metrics, first divergence, blocking divergence, and optional cost data. `--json` includes `capsule`, step counts, success fields, rates, duration, `timeToDivergence`, `firstDivergence`, `firstBlockingDivergence`, and `divergences`. | `0` means replay completed without blocking divergence. `1` means a blocking divergence, malformed input, missing browser, or command-level fatal error under the current root CLI. |
| `dbar validate <capsule-path>` | Validates capsule structure. Warnings, including safe-sharing warnings, are advisory and print to stderr without making a valid capsule fail. | `0` means valid. `1` means invalid capsule or command-level fatal error. |
| `dbar eval --capsules <dir> --assertions <yaml-path> [--json]` | Evaluates `.capsule` files against DBAR's small assertion format. The command shape and result intent are stable; the YAML dialect is intentionally narrow and not a general YAML API. | `0` means all evaluated capsules passed. `1` means assertion failure, invalid capsule, missing inputs, no assertions, no capsules, or command-level fatal error. |
| `dbar --help`, `dbar --version` | Prints usage or package version. | `0` on success. |

The Browserbase integration CLI keeps its separate documented convention:
`0` for success, `1` for replay completed with divergences, and `2` for fatal
errors.

## Capsule Compatibility

The stable 1.0.0 deterministic replay capsule is the root TypeScript archive:

- Manifest path: `capsule.json`.
- Manifest literals: `version: "1.0.0"` and `capsuleProfile: "replay"`.
- Archive paths in the compatibility contract: `network/<sha256>`,
  `snapshots/<step>/dom.json`, `snapshots/<step>/accessibility.json`,
  `snapshots/<step>/screenshot.png`, and optional `traces/<step>.json`.
- Serialized transport format: a base64-encoded JSON object whose keys are
  archive paths and whose values are base64 file contents.

After 1.0.0, any change that makes existing 1.0.0 capsules unreadable,
changes required manifest fields, changes archive paths, changes replay
matching semantics, or removes stable CLI/SDK output fields is a breaking
release-contract change. It must ship with migration notes, changelog entries,
compatibility tests, and either a reader for the previous format or an explicit
major-version migration path. Optional metadata may be added in a minor release
only when validators and replayers tolerate its absence.

## Python API Stability

The Python package is a recorder/diff lane for browser-use workflows, not the
root deterministic replay engine. Stable Python exports for 1.0.0 are:

- `DBARRecorder` with its constructor options, `on_step_end(agent)`, and
  `finish()`.
- `Capsule` with `Capsule.load(path)`, `diff(other)`, `summary()`, and the
  public `path`, `step_count`, `size_kb`, and `manifest` attributes.
- `__version__`.

Python capsules are JSON recorder/diff evidence artifacts. They do not use the
root TypeScript replay archive layout, do not freeze time, do not replay
network traffic, and should not be described as deterministic replay capsules.
Python modules outside the package root exports, including `dbar.types` and
private recorder helpers, are implementation details unless a later release
explicitly promotes them.

## Current Product Surface

- **`@pyyush/dbar` on npm**: deterministic capture and replay for Chromium/CDP Playwright sessions
- **Python package**: recorder/diff SDK for `browser-use` flows. The local
  package metadata targets `dbar==1.0.0`; PyPI publication is a release gate.
  See [python/README.md](./python/README.md).
- **Browserbase integration**: deterministic capture on Browserbase-hosted Chromium/CDP sessions, replay locally within DBAR's support boundaries. See [integrations/browserbase/README.md](./integrations/browserbase/README.md).

## Requirements

- Node.js >= 20
- `playwright-core` >= 1.40.0
- Chromium-based browser with CDP support

## Examples

Runnable examples live in [examples/](./examples):

- [01-capture-validate-replay.mjs](./examples/01-capture-validate-replay.mjs)
  captures `example.com`, writes a `.capsule`, validates it, and replays the
  same navigation boundary through `DBAR.startReplay`.
- [02-capture-on-failure.mjs](./examples/02-capture-on-failure.mjs) shows the
  capture-on-failure pattern used by CI jobs that keep capsules only for failed
  or explicitly high-value runs.
- [03-step-by-step-replay.mjs](./examples/03-step-by-step-replay.mjs) captures
  a two-step navigation/click flow and replays it by interleaving the same
  Playwright actions between DBAR step comparisons.

From a package checkout, run `npm run build` first so package self-reference
resolves to `dist/`, then follow [examples/README.md](./examples/README.md).

## API Reference

The root package exports only `@pyyush/dbar` and
`@pyyush/dbar/package.json`. The generated TypeScript declarations in
`dist/index.d.ts` are the source of truth for the 1.0.0 API reference, and
[docs/API_REFERENCE.md](./docs/API_REFERENCE.md) records the stable,
experimental, and internal surfaces. Hosted API reference publishing is a
release-pipeline gate; until that job is live, use the npm package
declarations, README examples, and the docs page together.

## Migration Notes

See [MIGRATION.md](./MIGRATION.md) for the 0.2.x to 1.0.0 migration notes.
The main breaking expectation is that the 1.0.0 contract is explicit:
Chromium/CDP deterministic replay remains in the root TypeScript package,
Python/browser-use remains recorder/diff evidence, and unsupported browser or
traffic surfaces must not be described as deterministic replay.

## Security Model

DBAR reads and replays untrusted capsule files, and capsules may contain full
browser evidence. The 1.0.0 security stance is:

- Treat capsules as sensitive incident artifacts unless they were recorded
  against scrubbed test data.
- Run `npx dbar validate <capsule>` before replay or handoff and review safe
  sharing warnings.
- Do not replay capsules from untrusted parties in privileged browser profiles
  or networks.
- DBAR blocks dangerous state-restoration URL protocols and common cloud
  metadata hosts, but it is not a general sandbox.
- Report vulnerabilities through [SECURITY.md](./SECURITY.md).

## Production Readiness Checklist

Before relying on a DBAR capsule as production evidence:

- Capture only a minimal, high-value workflow around the failure.
- Validate the capsule and keep validation output with the artifact.
- Replay it locally or in CI using the same action boundaries.
- Review safe-sharing warnings and avoid public uploads unless the data is
  scrubbed.
- Preserve the replay JSON with the capsule so future triage can inspect
  first divergence without re-running immediately.
- Keep DBAR on the supported Node, Chromium/CDP, and package versions recorded
  in this README.

## More

- [CHANGELOG.md](./CHANGELOG.md) — release notes
- [MIGRATION.md](./MIGRATION.md) — 0.2.x to 1.0.0 migration notes
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — top failure questions
- [SECURITY.md](./SECURITY.md) — disclosure and threat model notes
- [docs/API_REFERENCE.md](./docs/API_REFERENCE.md) — API stability reference
- [docs/RELEASE_PROCESS.md](./docs/RELEASE_PROCESS.md) — release gates, package verification, and repository settings
- [docs/adr/0001-browser-harness-interop.md](./docs/adr/0001-browser-harness-interop.md) — browser-harness decision record
- [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution and verification guidance
- [python/README.md](./python/README.md) — Python recorder and diff lane
- [integrations/browser-use/README.md](./integrations/browser-use/README.md) — browser-use integration
- [integrations/browserbase/README.md](./integrations/browserbase/README.md) — Browserbase integration

## License

Apache-2.0
