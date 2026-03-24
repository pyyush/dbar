# DBAR

**Record a browser session. Replay it. Get the same result.**

Browser automation is inherently non-deterministic — network timing varies, JavaScript timers fire unpredictably, and the same script produces different DOM states across runs. This makes browser-based workflows unreliable to test, impossible to audit, and difficult to trust.

DBAR fixes this. It freezes time, records every network response, and captures the full page state at each step. The result is a portable **capsule** — a self-contained artifact you can replay later to verify that the same inputs produce the same outputs.

```bash
npm install dbar playwright-core
```

## 30-Second Example

```ts
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "dbar";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");

// Wrap any Playwright workflow — DBAR records everything
const session = await DBAR.capture(page);

await session.step("loaded");
await page.click("a");
await session.step("after-click");

const archive = await session.finish();
const capsule = serializeCapsuleArchive(archive);
// capsule is a portable string — store it, send it, replay it later
```

That's it. Your existing Playwright code doesn't change. DBAR wraps around it.

## Replay and Verify

```ts
import { DBAR, deserializeCapsuleArchive } from "dbar";

const archive = deserializeCapsuleArchive(capsule);
const result = await DBAR.replay(page, archive);

result.success             // true — every step matched
result.replaySuccessRate   // 1.0
result.divergences         // [] — nothing diverged
```

If something changed — a new ad loaded, an API returned different data, a timer fired early — DBAR tells you exactly which step diverged and why.

## Why This Exists

If you're building any of these, you've hit the non-determinism problem:

- **AI browser agents** — An agent says it filled a form and clicked submit. Did it? Prove it. DBAR gives you a replayable receipt.
- **Browser test suites** — Your tests pass locally, fail in CI, pass again when you re-run. DBAR captures the exact state so you can diff what changed.
- **Compliance and audit** — Regulated workflows need evidence. A capsule is a cryptographically-hashed record of exactly what happened in the browser.
- **Workflow replay** — Record a human performing a task. Replay it programmatically. Verify the replay matches the original.

## How It Works

DBAR controls three sources of non-determinism at the CDP (Chrome DevTools Protocol) level:

**1. Time** — Virtual time via `Emulation.setVirtualTimePolicy`. `Date.now()`, `setTimeout`, and `requestAnimationFrame` all advance deterministically. No real-world clock jitter.

**2. Network** — Every request and response is recorded via the `Fetch` domain. On replay, responses are served from the capsule — same bytes, same order, same timing. Repeated identical requests are matched by `(requestHash, occurrenceIndex)`.

**3. State** — At each step boundary, DBAR captures the full DOM snapshot, accessibility tree, and screenshot. These are hashed with SHA-256. On replay, the live hashes are compared against the recorded hashes.

The step boundary is yours to define. Call `session.step()` wherever matters — after login, after a click, after data loads. DBAR pauses virtual time, waits for network quiescence, captures everything, then resumes.

## What's in a Capsule

A capsule is a self-contained archive:

```
capsule.json                         Manifest — environment, seeds, steps, metrics
network/<sha256>                     Deduplicated response bodies
snapshots/<step>/dom.json            Full DOM snapshot
snapshots/<step>/accessibility.json  Accessibility tree
snapshots/<step>/screenshot.png      Visual screenshot
```

Everything needed to replay the session is inside. No external dependencies, no database, no API keys. Capsules are validated with Zod schemas and an 8-check integrity suite before replay.

## Strict vs. Advisory Observables

| Observable | Strictness | What it proves |
|-----------|-----------|----------------|
| DOM snapshot hash | **Strict** | Page structure is identical |
| Accessibility tree hash | **Strict** | Semantic content is identical |
| Network digest | **Strict** | Same requests got same responses |
| Screenshot hash | Advisory | Visual appearance (rendering can vary across machines) |

A replay **passes** when all strict observables match. Screenshot differences are reported but don't fail the replay — pixel-level rendering varies across GPU drivers and OS versions.

## Replay Metrics

Every replay produces three numbers:

| Metric | What it means |
|--------|--------------|
| **RSR** (Replay Success Rate) | Fraction of steps where all strict observables matched. 1.0 = perfect replay. |
| **DVR** (Determinism Violation Rate) | `1 - RSR`. 0.0 is what you want. |
| **TTD** (Time to Divergence) | The first step that diverged. Tells you exactly where things went wrong. |

## API

### Capture

```ts
const session = await DBAR.capture(page, {
  seeds: { initialTime: 1700000000000 },  // Pin the epoch
  stepBudgetMs: 5000,                      // Virtual time budget per step
  screenshotMasks: [".ad-banner"],         // Mask dynamic content
});

const snap = await session.step("label");  // Returns StepSnapshot
const archive = await session.finish();    // Returns CapsuleArchive
await session.abort();                     // Or discard
```

### Replay

```ts
const result = await DBAR.replay(page, archive, {
  unmatchedRequestPolicy: "block",  // Block requests not in the transcript
  compareScreenshots: false,        // Default — screenshots are advisory
});
```

### Validate

```ts
const result = DBAR.validate(archive);
result.valid    // true if capsule is well-formed
result.checks   // 8 individual check results
result.errors   // What's wrong, if anything
```

### Serialize / Deserialize

```ts
const blob = serializeCapsuleArchive(archive);   // Portable base64 string
const archive = deserializeCapsuleArchive(blob); // Back to CapsuleArchive
```

## Advanced: Lower-Level APIs

Every subsystem is independently exported for custom integrations:

```ts
import {
  // Time control
  TimeVirtualizer,

  // Network record/replay
  NetworkRecorder,
  NetworkReplayer,

  // Snapshots
  captureDOMSnapshot,
  captureAccessibilitySnapshot,
  captureScreenshot,

  // Capsule assembly
  buildCapsule,
  validateCapsule,

  // All Zod schemas for the capsule format
  DeterminismCapsuleSchema,
  CapsuleStepSchema,
  // ... etc
} from "dbar";
```

You don't have to use the high-level `DBAR` API. Each piece works standalone with a Playwright `Page` or CDP `CDPSession`.

## Requirements

- Node.js >= 20
- `playwright-core` >= 1.40.0 (peer dependency)
- Chromium-based browser (CDP is required for virtual time and network interception)

## License

Apache-2.0
