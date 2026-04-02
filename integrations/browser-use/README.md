# DBAR browser-use Integration

First-class DBAR integration for `browser-use` workflows.

Use this lane when your agent already runs inside `browser-use` and you need
step-level DOM, accessibility, and screenshot evidence without asking DBAR to
take over browser ownership.

Compared with the Browserbase integration, this lane is intentionally
observe-only: it gives you snapshots, diffs, and an audit trail, not full
deterministic network/time replay.

This integration is verified against these exact versions:

- Python 3.11+
- `browser-use==0.12.5`
- `langchain-openai==0.1.25` for `example.py`
- `playwright-core==1.58.2`
- `ts-node==10.9.2`
- `typescript==5.9.3`
- `vitest==4.1.2`

## What This Does

DBAR connects to the same Chrome instance your browser-use agent is using
and captures DOM snapshots, accessibility trees, and screenshots at each
agent step boundary. This gives you a verifiable audit trail of what the
page looked like at each point in the agent's execution.

Each artifact is hashed with SHA-256 for integrity verification.

## What This Does Not Do

- Does not record network traffic
- Does not freeze time
- Does not produce a replayable determinism capsule

This sidecar intentionally stays out of browser-use's control loop. For full
deterministic capture and replay, use DBAR directly with Playwright or the
[Browserbase integration](../browserbase/README.md).

## Integration Contract With browser-use 0.12.5

The supported hook surface is:

```python
await agent.run(on_step_end=...)
```

The integration should not pass `on_step_end` into `Agent(...)`.

The browser session should be started before the sidecar is launched so you can
hand DBAR the real `browser.cdp_url` chosen by browser-use:

```python
browser = Browser(headless=False)
await browser.start()
cdp_url = browser.cdp_url
```

browser-use launches local Chrome on a free remote-debugging port, so assuming
a fixed `9222` port is incorrect.

## How It Works

At each step:

1. browser-use runs a step and calls `on_step_end(agent)`
2. The Python hook writes a `.dbar-step` signal file
3. The signal payload includes both the step label and the current
   `agent.browser_session.agent_focus_target_id`
4. The Node.js sidecar resolves the matching page target over CDP
5. DBAR captures DOM snapshot + accessibility tree + screenshot for that page
6. On `.dbar-finish`, a manifest JSON is written with all step data

```text
browser-use (Python)                 DBAR capture (Node.js)
    |                                    |
    +- Browser()                         +- chromium.connectOverCDP(cdpUrl)
    +- await browser.start()             |
    |                                    +- resolve page by targetId each step
    +- agent.run(                        |
    |    on_step_end=signal_step         |  <- watches .dbar-step files
    |  )                                 |
    |                                    +- DOMSnapshot.captureSnapshot
    +- on_step_end writes JSON           +- Accessibility.getFullAXTree
    |   {label, targetId}                +- Page.captureScreenshot
    +- agent finishes                    |
    +- writes .dbar-finish               +- writes manifest.json
    |                                    |
    +- done                              +- done
```

## Pinned Versions

- browser-use: 0.12.5
- cdp-use: 1.4.5
- langchain-openai: 0.1.25 for `example.py`
- playwright-core: 1.58.2
- ts-node: 10.9.2
- typescript: 5.9.3
- vitest: 4.1.2

## Setup

### 1. Install Python dependencies

```bash
python3.11 -m venv .venv
source .venv/bin/activate
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

In your Python process:

```python
browser = Browser(headless=False)
await browser.start()
print(browser.cdp_url)
```

Then start the capture sidecar with that CDP URL:

```bash
npx tsx capture.ts "$BROWSER_USE_CDP_URL" ./dbar-snapshots
```

Signal DBAR at step boundaries:

```python
from pathlib import Path
import json

Path(".dbar-step").write_text(json.dumps({
    "label": "after-login",
    "targetId": agent.browser_session.agent_focus_target_id,
}))
```

When the agent is done:

```bash
touch .dbar-finish
```

## Output

The sidecar writes to `./dbar-snapshots/`:

```text
dbar-snapshots/
  manifest.json
  step-001/
    dom.json
    a11y.json
    screenshot.png
  step-002/
    ...
```

## File-Based Signaling

| Signal file    | Effect |
|----------------|--------|
| `.dbar-step`   | Captures a step. Accepts either a plain label or JSON `{ "label": "...", "targetId": "..." }`. |
| `.dbar-finish` | Ends the session and writes the manifest to disk. |

Signal files are consumed after being read. The sidecar polls every 250ms.

## Files

| File | Description |
|------|-------------|
| `capture.ts` | Node.js sidecar: CDP attach, target resolution, snapshot loop, manifest |
| `capture.test.ts` | Unit tests for capture utilities |
| `example.py` | End-to-end Python example with browser-use |
| `requirements.txt` | Pinned Python dependencies |
| `package.json` | Node.js dependencies |
| `tsconfig.json` | TypeScript configuration |

## License

Apache-2.0
