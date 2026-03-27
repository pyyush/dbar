# DBAR + browser-use

Capture page state snapshots at each step of a browser-use agent run.

## What This Does

DBAR connects to the same Chrome instance your browser-use agent is using
and captures DOM snapshots, accessibility trees, and screenshots at each
agent step boundary. This gives you a verifiable audit trail of what the
page looked like at each point in the agent's execution.

Each artifact is hashed with SHA-256 for integrity verification.

## What This Does NOT Do

- Does NOT record network traffic (would conflict with browser-use's CDP usage via cdp-use)
- Does NOT freeze time (would break the agent's timers)
- Does NOT produce a replayable determinism capsule (that requires DBAR to control the browser exclusively)

For full deterministic capture and replay, use DBAR directly with Playwright
(not through browser-use).

## How It Works

browser-use v0.12.5 provides `on_step_end` lifecycle hooks. At each step:

1. The Python hook writes a `.dbar-step` signal file
2. The Node.js capture sidecar detects it via filesystem polling
3. DBAR captures DOM snapshot + accessibility tree + screenshot via CDP
4. SHA-256 hashes are computed for each artifact
5. On `.dbar-finish`, a manifest JSON is written with all step data

```
browser-use (Python)                 DBAR capture (Node.js)
    |                                    |
    +- Browser(headless=False)           +- chromium.connectOverCDP(cdpUrl)
    |                                    +- newCDPSession(page)
    +- agent.run(                        |
    |    on_step_end=signal_step         |  <- watches .dbar-step files
    |  )                                 |
    |                                    +- DOMSnapshot.captureSnapshot
    +- on_step_end writes .dbar-step     +- Accessibility.getFullAXTree
    |                                    +- Page.captureScreenshot
    +- agent finishes                    |
    +- writes .dbar-finish               +- writes manifest.json
    |                                    |
    +- done                              +- done
```

## Pinned Versions

- browser-use: 0.12.5
- cdp-use: 1.4.5 (browser-use's CDP client)

## Setup

### 1. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2. Install Node.js dependencies

```bash
cd integrations/browser-use
npm install
```

### 3. Set API key

```bash
export OPENAI_API_KEY="sk-..."
# Or use ChatAnthropic + ANTHROPIC_API_KEY instead
```

## Usage

### Run the example

```bash
python example.py
```

### Run capture sidecar manually

In one terminal, start the capture sidecar:

```bash
npx tsx capture.ts http://localhost:9222 ./dbar-snapshots
```

In another terminal, run your browser-use agent. Signal DBAR at step boundaries:

```bash
# Trigger a step capture (file content = label)
echo "after-login" > .dbar-step

# When the agent is done
touch .dbar-finish
```

## Output

The sidecar writes to `./dbar-snapshots/`:

```
dbar-snapshots/
  manifest.json          # Session metadata + per-step hashes
  step-001/
    dom.json             # Full DOM snapshot
    a11y.json            # Accessibility tree
    screenshot.png       # Page screenshot
  step-002/
    ...
```

## File-Based Signaling

| Signal file    | Effect                                              |
|----------------|-----------------------------------------------------|
| `.dbar-step`   | Captures a step. File content is used as the label. |
| `.dbar-finish` | Ends the session and writes the manifest to disk.   |

Signal files are consumed (deleted) after being read. The sidecar polls every 250ms.

## Files

| File              | Description                                          |
|-------------------|------------------------------------------------------|
| `capture.ts`      | Node.js sidecar: CDP attach, snapshot loop, manifest |
| `capture.test.ts` | Unit tests for capture utilities                     |
| `example.py`      | End-to-end Python example with browser-use           |
| `requirements.txt`| Pinned Python dependencies                           |
| `package.json`    | Node.js dependencies                                 |
| `tsconfig.json`   | TypeScript configuration                             |

## License

Apache-2.0
