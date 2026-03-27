# DBAR + browser-use

Record browser sessions deterministically alongside browser-use agents.

## How It Works

DBAR captures browser sessions using its own Playwright/CDP instance. It does
**not** attach to browser-use's browser process -- browser-use uses raw CDP
(`cdp-use`), and two CDP clients cannot safely share the Fetch domain.

Instead, DBAR runs a parallel capture:

1. Your browser-use agent navigates a website in its own browser
2. DBAR's capture script navigates the same URLs in a separate headless browser
3. DBAR records the page state (DOM, network, screenshots) at each step
4. The capsule captures what the page looked like -- not the agent's actions

This gives you a deterministic record of the website's behavior, which you
can replay to verify that the site hasn't changed between runs.

## Limitations

- DBAR does NOT record browser-use's internal actions (clicks, typing, etc.)
- DBAR captures a parallel session, not the agent's actual session
- Step boundaries are manual (you signal when to capture via files)
- For true agent-action recording, DBAR works best with Playwright-based
  agents where it wraps the same page the agent controls

## Setup

### 1. Install dependencies

```bash
# In your Python environment
pip install browser-use langchain-openai

# In this directory
npm install
```

### 2. Run DBAR capture alongside your agent

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

## Security Notice

Capsules contain full network response bodies, cookies, localStorage values,
and screenshots. These may include sensitive data (session tokens, PII,
financial information). Handle capsule files with the same care as database
backups.

- Do not commit capsules to public repositories
- Use DBAR's header redaction (enabled by default for auth headers)
- Consider using `--no-screenshots` for sensitive workflows
- Review capsule contents before sharing

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
