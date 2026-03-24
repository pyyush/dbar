# DBAR — Deterministic Browser Agent Runtime

Replayable, verifiable browser executions. DBAR captures browser sessions into portable **determinism capsules** that can be replayed to verify identical behavior.

Built on CDP (Chrome DevTools Protocol) virtual time, network record/replay, and multi-observable snapshot hashing.

## Install

```bash
npm install dbar playwright-core
```

## Quick Start

### Capture a session

```ts
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "dbar";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");

// Start capturing
const session = await DBAR.capture(page);

// Record step boundaries
await session.step("initial-load");
await page.click("a");
await session.step("after-click");

// Finish and get the capsule
const archive = await session.finish();
const blob = serializeCapsuleArchive(archive);
// blob is a portable base64 string you can store or transmit

await browser.close();
```

### Replay and verify

```ts
import { DBAR, deserializeCapsuleArchive } from "dbar";

const archive = deserializeCapsuleArchive(blob);
const page = await browser.newPage();

const result = await DBAR.replay(page, archive);

console.log(result.success);              // true if all steps matched
console.log(result.replaySuccessRate);     // 0.0 – 1.0
console.log(result.divergences);           // detailed mismatch info
```

### Validate a capsule

```ts
import { DBAR, deserializeCapsuleArchive } from "dbar";

const archive = deserializeCapsuleArchive(blob);
const result = DBAR.validate(archive);

console.log(result.valid);     // true if capsule is well-formed
console.log(result.checks);    // individual check results
```

## What's in a Capsule?

A determinism capsule is a self-contained archive:

```
capsule.json                        # Manifest (environment, seeds, steps, metrics)
network/<sha256>                    # Deduplicated response bodies
snapshots/<step>/dom.json           # DOM snapshot per step
snapshots/<step>/accessibility.json # Accessibility tree per step
snapshots/<step>/screenshot.png     # Screenshot per step
traces/<step>.json                  # Optional trace segment
```

## Observables

Each step captures four observables:

| Observable | Comparison | Purpose |
|-----------|-----------|---------|
| `domSnapshotHash` | Strict | DOM structure determinism |
| `accessibilityHash` | Strict | Accessibility tree determinism |
| `networkDigest` | Strict | Network request/response determinism |
| `screenshotHash` | Advisory | Visual regression (not strict due to rendering variance) |

## Replay Metrics

| Metric | Description |
|--------|------------|
| RSR (Replay Success Rate) | Fraction of steps with matching observables |
| DVR (Determinism Violation Rate) | `1 - RSR` |
| TTD (Time to Divergence) | First step index where replay diverges |

## API Reference

### `DBAR.capture(page, options?)`
Start a capture session. Returns a `CaptureSession`.

**Options:**
- `seeds.initialTime` — Virtual time epoch (default: `Date.now()`)
- `seeds.rngSeed` — RNG seed for deterministic randomness
- `stepBudgetMs` — Virtual time budget per step (default: 10000ms)
- `screenshotMasks` — CSS selectors to mask in screenshots

### `CaptureSession`
- `.step(label?)` — Record a step boundary, returns `StepSnapshot`
- `.finish()` — End capture, returns `CapsuleArchive`
- `.abort()` — Abort capture, discard data

### `DBAR.replay(page, archive, options?)`
Replay a capsule against a live page. Returns `ReplayResult`.

### `DBAR.validate(archive)`
Validate capsule structure. Returns `ValidationResult`.

### Serialization
- `serializeCapsuleArchive(archive)` — Encode to portable base64 string
- `deserializeCapsuleArchive(blob)` — Decode back to `CapsuleArchive`

## Lower-level APIs

For advanced use cases, DBAR exports all subsystems:

- `Coordinator` — Orchestrates capture sessions
- `NetworkRecorder` / `NetworkReplayer` — CDP Fetch-based network record/replay
- `TimeVirtualizer` — CDP Emulation virtual time control
- `captureDOMSnapshot` / `captureAccessibilitySnapshot` / `captureScreenshot` — Snapshot modules
- `buildCapsule` / `validateCapsule` — Capsule assembly and validation
- All Zod schemas (`DeterminismCapsuleSchema`, etc.) for capsule format validation

## Requirements

- Node.js >= 20
- `playwright-core` >= 1.40.0 (peer dependency)
- Chromium-based browser (CDP required for virtual time and network interception)

## License

Apache-2.0
