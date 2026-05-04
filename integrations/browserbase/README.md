# DBAR Browserbase Integration

First-class DBAR integration for [Browserbase](https://www.browserbase.com/)
sessions.

Use this lane when you want DBAR to own a Browserbase-hosted Chromium/CDP
session end to end and keep deterministic capture, replay, and
first-divergence diagnosis within DBAR's current browser support boundaries.

Compared with the `browser-use` integration, Browserbase is the full-control
lane: DBAR owns the session, records network, freezes time, and produces a
replayable capsule.

This integration is verified against these exact versions:

- Node.js 20+
- `@browserbasehq/sdk==2.9.0`
- `playwright-core==1.58.2`
- `tsx==4.21.0`
- `typescript==5.9.3`
- `vitest==4.1.2`

**DBAR owns the Browserbase session.** Unlike the browser-use integration (where DBAR is a sidecar observing someone else's browser), here DBAR controls the session end-to-end over Chromium CDP. This means deterministic capture works for DBAR's current supported surfaces: virtual time, recorded HTTP responses, and replayable capsules.

| | browser-use integration | Browserbase integration |
|---|---|---|
| Who owns the browser? | browser-use (agent) | DBAR |
| Deterministic replay? | No (DBAR does not own the browser) | Yes, within DBAR's supported surfaces |
| Virtual time? | No | Yes |
| Network recording? | No | Yes |
| Replayable capsule? | No (snapshots only) | Yes |
| Value prop | Audit trail of page state | Deterministic record + replay for supported surfaces |

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

- `@browserbasehq/sdk` 2.9.0 (uses `session.connectUrl` for CDP)
- `playwright-core` 1.58.2
- `tsx` 4.21.0
- `typescript` 5.9.3
- `vitest` 4.1.2

## Capture

Record a page with DBAR deterministic controls in a Browserbase cloud browser:

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
4. Runs DBAR.capture() with virtual time + network recording
5. Captures the specified number of steps
6. Saves the capsule to disk
7. Closes the session

The `connectUrl` contains the API key as a query parameter. All log output masks this value automatically.

### Optional live smoke

`npm test` includes a Browserbase live capture smoke test that is skipped unless
both `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` are present. Local and CI
verification do not require Browserbase secrets; when credentials are supplied,
the smoke captures one `https://example.com` step into a temporary capsule and
validates that the capsule is replay-profile data.

## Browser Support And Limits

The Browserbase lane requires a Browserbase session that exposes a Chromium CDP
connection through `session.connectUrl`. Firefox and WebKit are unsupported for
deterministic replay unless DBAR later implements equivalent browser-specific
controls.

Replay runs locally and still needs a Chromium-compatible browser. This
integration uses `playwright-core`, so browser binaries are not installed
automatically. If local replay fails with a missing-browser error, install
Chromium with `npm install playwright` followed by `npx playwright install
chromium`, or point Playwright at an existing Chrome/Chromium executable.

Current replay boundaries:

- WebSockets and Server-Sent Events (SSE) traffic is not replayed from the
  recorded HTTP transcript.
- Service workers can intercept traffic outside the replayed response path.
- `sessionStorage`, IndexedDB, and browser cache state are not serialized as
  replay inputs.
- Cross-target workers, popups, downloads, uploads, auth prompts, file pickers,
  and browser profile side effects are not deterministic replay surfaces today.

This integration does not add a browser-harness dependency, backend, or CI
matrix. Live Browserbase credentials are needed for capture examples, but local
unit tests and local replay should not require a live Browserbase gate.

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

Browserbase capsules are full-fidelity replay artifacts and are sensitive by
default. DBAR redacts known auth headers, and this integration masks
`session.connectUrl` in logs, but cookies, localStorage values, URL query
values, response bodies, and screenshots can still contain session tokens, PII,
or other secrets. Treat capsule files with the same care as database backups.

- Do not commit capsules to public repositories
- Run `npx dbar validate <capsule>` and review safe-sharing warnings before
  upload or handoff
- Re-record against scrubbed test data for external sharing when possible
- If full-fidelity production evidence must be shared, handle it as explicitly
  unsafe sensitive material through approved private channels

## Files

| File | Description |
|------|-------------|
| `capture.ts` | CLI: create Browserbase session, capture deterministic capsule |
| `replay.ts` | CLI: replay capsule locally, output results |
| `example.ts` | End-to-end demo (capture on Browserbase, replay locally) |
| `helpers.ts` | Pure helper functions (arg parsing, URL masking) |
| `package.json` | Dependencies (pins @browserbasehq/sdk 2.9.0) |
| `tsconfig.json` | TypeScript configuration |
| `__tests__/` | Unit tests for helper functions |

## License

Apache-2.0
