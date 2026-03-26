# DBAR + Browserbase Integration

Deterministic capture and replay for [Browserbase](https://www.browserbase.com/) cloud browser sessions.

Your Browserbase agent ran in the cloud. DBAR gives you a replayable receipt of exactly what happened.

## Architecture

```
Browserbase (cloud browser)              DBAR capture (Node.js)
    |                                        |
    v                                        v
Cloud Browser  <── CDP (WebSocket) ──>  DBAR.capture(page)
(session wsUrl)                              |
    |                                    session.step("label")
    v                                        |
Agent actions                            session.finish()
(Stagehand, Playwright, etc.)                |
                                         capsule.json
                                             |
                                    Local browser (replay)
                                         capsule verified
```

DBAR connects to the same cloud browser your agent controls via CDP. It does not launch a separate browser or interfere with agent actions. Capsules are replayed locally to prove the cloud session is deterministically reproducible.

## Setup

### 1. Install dependencies

```bash
cd integrations/browserbase
npm install
```

### 2. Set Browserbase credentials

```bash
export BROWSERBASE_API_KEY=your-api-key
export BROWSERBASE_PROJECT_ID=your-project-id
```

### 3. Capture a session

**Option A: Via Browserbase session ID** (recommended)

Start your Browserbase session, then attach DBAR:

```bash
node --loader ts-node/esm capture.ts --session-id <session-id> --output-dir ./capsules
```

**Option B: Via direct CDP URL**

If you already have the WebSocket CDP URL:

```bash
node --loader ts-node/esm capture.ts --cdp-url ws://connect.browserbase.com/... --output-dir ./capsules
```

Signal DBAR at meaningful boundaries from your agent code:

```bash
# Trigger a step capture (content = label)
echo "after-login" > .dbar-step

# When the agent is done, signal finish
echo "done" > .dbar-finish
```

The capsule is written to `./capsules/capsule-<timestamp>.json`.

## Replay

Replay a captured capsule locally to verify determinism:

```bash
node --loader ts-node/esm replay.ts ./capsules/capsule-2026-03-26T10-00-00-000Z.json
```

The replay result (JSON) is printed to stdout. Exit code 0 means all steps matched; exit code 1 means divergences were detected.

Replay always runs on a **local** browser, not on Browserbase. That is the point: record in the cloud, verify locally.

## Programmatic Usage

You can also use DBAR directly in your TypeScript code instead of the file-based signaling scripts:

```typescript
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";

// Connect to your Browserbase session's CDP endpoint
const browser = await chromium.connectOverCDP(wsUrl);
const page = browser.contexts()[0].pages()[0];

// Capture
const session = await DBAR.capture(page);
await session.step("after-login");
await session.step("after-action");
const archive = await session.finish();

// Save the capsule
const serialized = serializeCapsuleArchive(archive);
writeFileSync("capsule.json", serialized);

// Later: replay locally
const result = await DBAR.replay(freshPage, archive);
console.log(result.replaySuccessRate); // 1.0
```

See `example.ts` for a complete working example.

## File-Based Signaling

| Signal file    | Effect                                              |
|----------------|-----------------------------------------------------|
| `.dbar-step`   | Captures a step. File content is used as the label. |
| `.dbar-finish` | Ends the session and writes the capsule to disk.    |

Signal files are consumed (deleted) after being read. The capture process polls every 250ms.

## Files

| File           | Description                                         |
|----------------|-----------------------------------------------------|
| `capture.ts`   | Node.js script: CDP attach via Browserbase API or direct URL, capture session, signal loop |
| `replay.ts`    | Node.js script: load capsule, replay locally, output JSON |
| `example.ts`   | End-to-end TypeScript example (create session, capture, replay) |
| `package.json` | Node.js dependencies                                |
| `tsconfig.json`| TypeScript configuration                            |

## License

Apache-2.0
