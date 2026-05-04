# DBAR browser-use Integration

First-class DBAR integration for `browser-use` workflows.

Use this lane when your agent already runs inside `browser-use` and you need
step-level DOM, accessibility, and screenshot evidence without asking DBAR to
take over browser ownership.

Compared with the Browserbase integration, this lane is intentionally
observe-only: it gives you snapshots, diffs, and an audit trail, not full
deterministic network/time replay.

This integration's Node sidecar is verified against these exact package
versions:

- `playwright-core==1.58.2`
- `ts-node==10.9.2`
- `typescript==5.9.3`
- `vitest==4.1.2`

Python `browser-use` itself is not shipped by DBAR 1.0.0. As of May 4, 2026,
PyPI's latest `browser-use` is `0.12.6`; both `0.12.5` and `0.12.6` exact-pin
transitive dependencies that fail `pip-audit`. Use this integration only in an
application environment where your chosen `browser-use` dependency set audits
clean.

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
- Does not support deterministic replay on Firefox or WebKit

This sidecar intentionally stays out of browser-use's control loop. For
deterministic capture and replay within DBAR's supported Chromium/CDP
boundaries, use DBAR directly with Playwright or the [Browserbase
integration](../browserbase/README.md).

## Browser Support And Limits

This integration attaches to the Chrome/Chromium CDP endpoint that browser-use
already created. browser-use remains the browser owner; DBAR is only an
observer. The sidecar does not launch a browser, choose a browser binary, or
install Playwright browsers.

If browser-use fails because Chrome or a Playwright browser binary is missing,
fix the browser-use/Playwright environment first. Then pass the actual
`browser.cdp_url` into the DBAR sidecar.

Because this lane is snapshot-only, these surfaces are not replayed or
normalized by DBAR here:

- WebSockets and Server-Sent Events (SSE) traffic
- service workers
- `sessionStorage`, IndexedDB, and browser cache state
- cross-target workers and popups
- downloads, uploads, auth prompts, and file pickers

There is no browser-harness dependency, backend, or CI matrix in this
integration.

## Integration Contract With browser-use-compatible Agents

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

## Dependency Status

- playwright-core: 1.58.2
- ts-node: 10.9.2
- typescript: 5.9.3
- vitest: 4.1.2
- browser-use Python package: not installed, pinned, or audited by DBAR
  release automation until upstream publishes a dependency set with no
  high/critical audit findings

## Setup

### 1. Prepare Python dependencies

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip pip-audit
# Install browser-use and your LLM provider here only after your own audit
# passes. requirements.txt is intentionally comment-only for DBAR 1.0.0.
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
| `requirements.txt` | Comment-only dependency audit notice; DBAR 1.0.0 does not ship browser-use pins |
| `package.json` | Node.js dependencies |
| `tsconfig.json` | TypeScript configuration |

## License

Apache-2.0
