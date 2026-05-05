# Migrating To DBAR 1.0.0

These notes cover the planned 0.2.x to 1.0.0 release. The final release notes
must be checked against the published tag before announcing general
availability.

## Version Truth

As of May 4, 2026:

- npm latest for `@pyyush/dbar` is `0.2.0`.
- PyPI has no `dbar` distribution.

The local release plan targets `1.0.0` because the public TypeScript SDK, root
CLI, capsule archive shape, Python recorder/diff lane, and integration support
boundaries are being frozen as a stable release contract.

## What Changes

- The root TypeScript package is the deterministic capture/replay engine for
  Chromium/CDP Playwright sessions.
- The stable replay archive is a base64-encoded JSON object containing
  `capsule.json`, `network/<sha256>`, `snapshots/<step>/...`, and optional
  traces.
- Multi-step workflows should replay through `DBAR.startReplay` so callers can
  repeat the same navigation, click, typing, or setup actions between DBAR step
  comparisons.
- The Python package remains a browser-use recorder/diff evidence lane. It does
  not freeze time, replay network traffic, or emit the root TypeScript replay
  archive format.
- Browserbase support is a separate integration where DBAR owns a hosted
  Chromium/CDP session and replays locally.

## Required User Actions

1. Install an explicit Chromium-capable browser dependency:

   ```bash
   npm install @pyyush/dbar playwright
   npx playwright install chromium
   ```

   Use `playwright-core` only if your runtime already provides a Chrome or
   Chromium executable.

2. Replace actionful `DBAR.replay(...)` usage with `DBAR.startReplay(...)`:

   ```ts
   const replay = await DBAR.startReplay(page, archive);
   await page.goto("https://example.com");
   await replay.step();
   const result = await replay.finish();
   ```

3. Treat `.capsule` files as sensitive evidence. Validate and review warnings
   before upload or external handoff:

   ```bash
   npx dbar validate ./path/to/run.capsule
   ```

4. Do not describe Python/browser-use capsules as deterministic replay
   capsules. They are recorder/diff artifacts.

## Compatibility Promises After 1.0.0

After 1.0.0, changes that make 1.0.0 capsules unreadable, change required
manifest fields, change archive paths, alter stable replay result fields, or
remove stable SDK/CLI surfaces are breaking changes and require migration
notes.

Optional metadata may be added in a minor release only when validators and
replayers tolerate its absence.

## Known Limits

- Deterministic replay is Chromium/CDP-only.
- WebSockets, SSE, service workers, `sessionStorage`, IndexedDB, browser cache,
  workers, popups, downloads, uploads, auth prompts, and file pickers are not
  deterministic replay surfaces in 1.0.0.
- Browser-harness is optional live-runner interop only. DBAR does not depend on
  it or use it as a backend.
