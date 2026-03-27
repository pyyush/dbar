# DBAR + Browserbase Integration

Deterministic capture on [Browserbase](https://www.browserbase.com/) cloud browsers, replay locally.

**DBAR owns the Browserbase session.** Unlike the browser-use integration (where DBAR is a sidecar observing someone else's browser), here DBAR controls the session end-to-end. This means full deterministic capture works: virtual time, network recording, and replayable capsules.

| | browser-use integration | Browserbase integration |
|---|---|---|
| Who owns the browser? | browser-use (agent) | DBAR |
| Full determinism? | No (CDP conflict) | Yes |
| Virtual time? | No | Yes |
| Network recording? | No | Yes |
| Replayable capsule? | No (snapshots only) | Yes |
| Value prop | Audit trail of page state | Full deterministic record + replay |

## Setup

```bash
cd integrations/browserbase
npm install
```

### Credentials

Auth is via environment variables only. Never pass secrets as CLI flags.

```bash
export BROWSERBASE_API_KEY=your-api-key
export BROWSERBASE_PROJECT_ID=your-project-id
```

### Pinned Versions

- `@browserbasehq/sdk` ^2.6.0 (uses `session.connectUrl` for CDP)
- `playwright-core` >=1.40.0 (peer dependency)

## Capture

Record a page with full determinism in a Browserbase cloud browser:

```bash
npx tsx capture.ts --url https://books.toscrape.com/ --steps 3 --output ./capsules/demo.capsule
```

| Flag | Description | Default |
|------|-------------|---------|
| `--url` | URL to navigate to and capture | (required) |
| `--steps` | Number of steps to capture | 1 |
| `--output` | Capsule output path | `./capsules/<timestamp>.capsule` |

The capture script:
1. Creates a Browserbase session via the SDK
2. Connects via `session.connectUrl` (CDP WebSocket)
3. Navigates to the target URL
4. Runs DBAR.capture() with full virtual time + network recording
5. Captures the specified number of steps
6. Saves the capsule to disk
7. Closes the session

The `connectUrl` contains the API key as a query parameter. All log output masks this value automatically.

## Replay

Replay a captured capsule on a local browser. No Browserbase credentials needed.

```bash
npx tsx replay.ts ./capsules/demo.capsule
npx tsx replay.ts ./capsules/demo.capsule --json
```

| Flag | Description | Default |
|------|-------------|---------|
| `<capsule-path>` | Path to capsule file | (required) |
| `--json` | Output structured JSON to stdout | false |

Exit codes: 0 = all steps matched, 1 = divergences detected, 2 = fatal error.

Set `DBAR_NO_SANDBOX=1` to add `--no-sandbox` to the local Chromium launch (CI environments only).

## Example

Full end-to-end demo: create session, browse books.toscrape.com, capture 3 steps, replay locally.

```bash
npx tsx example.ts
```

## Programmatic Usage

```typescript
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { DBAR, serializeCapsuleArchive } from "@pyyush/dbar";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
});

const browser = await chromium.connectOverCDP(session.connectUrl);
const page = browser.contexts()[0].pages()[0];

// DBAR owns the session — full determinism
const dbar = await DBAR.capture(page);
await page.goto("https://example.com");
await dbar.step("homepage");
const archive = await dbar.finish();

// Save capsule
const capsule = serializeCapsuleArchive(archive);

// Later: replay locally (no Browserbase needed)
const result = await DBAR.replay(freshPage, archive);
console.log(result.replaySuccessRate); // 1.0
```

## Security Notice

Capsules contain full network response bodies, cookies, localStorage values, and screenshots. These may include session tokens, PII, or other sensitive data. Treat capsule files with the same care as database backups.

- Do not commit capsules to public repositories
- DBAR redacts auth headers by default
- Review capsule contents before sharing

## Files

| File | Description |
|------|-------------|
| `capture.ts` | CLI: create Browserbase session, capture deterministic capsule |
| `replay.ts` | CLI: replay capsule locally, output results |
| `example.ts` | End-to-end demo (capture on Browserbase, replay locally) |
| `helpers.ts` | Pure helper functions (arg parsing, URL masking) |
| `package.json` | Dependencies (pins @browserbasehq/sdk ^2.6.0) |
| `tsconfig.json` | TypeScript configuration |
| `__tests__/` | Unit tests for helper functions |

## License

Apache-2.0
