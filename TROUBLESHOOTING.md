# DBAR Troubleshooting

## 1. `dbar replay` launches Chromium but reports a divergence immediately.

Check whether the capsule requires caller actions. The CLI does not click,
type, navigate, or run an application script between captured step boundaries.
For actionful workflows, use `DBAR.startReplay` and repeat the same Playwright
actions before each `replay.step()`.

## 2. Replay fails with a missing browser error.

`@pyyush/dbar` uses `playwright-core` as a peer dependency and does not install
browser binaries. Install Chromium with Playwright or point Playwright at an
existing Chrome/Chromium executable:

```bash
npm install playwright
npx playwright install chromium
```

## 3. A capsule validates with warnings. Can I share it?

Warnings are advisory, not structural failures. They usually mean the capsule
may contain sensitive material such as cookies, localStorage, URL query values,
response bodies, or screenshots. Share only through trusted private channels or
re-record against scrubbed test data.

## 4. Browserbase capture works, but local replay fails.

Browserbase capture uses a hosted Chromium/CDP session. Local replay still needs
a local Chromium-compatible browser and DBAR's supported replay surfaces. It
does not need Browserbase credentials.

## 5. The browser-use integration does not replay a run.

That is expected. The browser-use lane is observe-only: it records snapshots,
hashes, and diffs for browser-use workflows. Use the root TypeScript package or
Browserbase lane when DBAR must own the Chromium/CDP session and perform
deterministic replay.

## 6. Firefox or WebKit behavior differs from Chromium.

Firefox and WebKit are unsupported for deterministic replay in 1.0.0. Do not
treat cross-browser differences as DBAR replay failures until browser-specific
deterministic controls are implemented.

## 7. `dbar eval` rejects my YAML.

`dbar eval` intentionally supports a narrow assertion format. It is not a
general YAML automation language. Keep assertions small, validate capsules
first, and treat command exit code `1` as either an assertion failure, invalid
input, or command-level fatal error.
