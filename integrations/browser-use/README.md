# DBAR + browser-use Integration

Deterministic capture and replay for [browser-use](https://github.com/browser-use/browser-use) agent sessions.

browser-use is a Python framework that runs AI agents on Playwright browsers. This bridge connects DBAR's capture/replay engine to browser-use's running browser via CDP, producing portable determinism capsules you can replay offline to verify agent behavior.

## Architecture

```
browser-use (Python)                    DBAR capture (Node.js)
    |                                       |
    v                                       v
Playwright Browser  <── CDP attach ──>  DBAR.capture(page)
(--remote-debugging-port=9222)              |
    |                                   session.step("label")
    v                                       |
Agent actions                           session.finish()
                                            |
                                        capsule.json
```

DBAR attaches to the same browser that browser-use controls. It does not launch a separate browser or interfere with agent actions. Communication between the Python agent and the Node.js capture process uses simple file-based signals.

## Setup

### 1. Install dependencies

```bash
# In your Python environment
pip install browser-use langchain-openai

# In this directory
npm install
```

### 2. Launch browser-use with remote debugging

Configure browser-use to expose a CDP endpoint:

```python
from browser_use import Browser, BrowserConfig

browser = Browser(
    config=BrowserConfig(
        chrome_instance_path="http://localhost:9222",
    )
)
```

Or launch Chrome manually with `--remote-debugging-port=9222`.

### 3. Run DBAR capture alongside your agent

In one terminal, start the capture process:

```bash
node --loader ts-node/esm capture.ts http://localhost:9222 ./capsules
```

In another terminal (or in your Python script), run your browser-use agent. Signal DBAR at meaningful boundaries:

```bash
# Trigger a step capture (content = label)
echo "after-login" > .dbar-step

# When the agent is done, signal finish
echo "done" > .dbar-finish
```

The capsule is written to `./capsules/capsule-<timestamp>.json`.

## Replay

Replay a captured capsule to verify determinism:

```bash
node --loader ts-node/esm replay.ts ./capsules/capsule-2026-03-26T10-00-00-000Z.json
```

The replay result (JSON) is printed to stdout. Exit code 0 means all steps matched; exit code 1 means divergences were detected.

## File-Based Signaling

| Signal file    | Effect                                              |
|----------------|-----------------------------------------------------|
| `.dbar-step`   | Captures a step. File content is used as the label. |
| `.dbar-finish` | Ends the session and writes the capsule to disk.    |

Signal files are consumed (deleted) after being read. The capture process polls every 250ms.

## Files

| File           | Description                                         |
|----------------|-----------------------------------------------------|
| `capture.ts`   | Node.js script: CDP attach, capture session, signal loop |
| `replay.ts`    | Node.js script: load capsule, replay, output JSON   |
| `example.py`   | End-to-end Python example with browser-use          |
| `package.json` | Node.js dependencies                                |
| `tsconfig.json`| TypeScript configuration                            |

## License

Apache-2.0
