# DBAR — Deterministic Browser Agent Runtime

Standalone TypeScript package for replayable, verifiable browser executions.

## Structure

```
src/
  sdk.ts                 High-level API: DBAR.capture(), DBAR.replay(), DBAR.validate()
  coordinator.ts         Orchestrates CDP subsystems for capture sessions
  index.ts               Barrel exports
  capsule/
    types.ts             Zod schemas for determinism capsule format
    builder.ts           Capsule assembly + serialization/deserialization
    validator.ts         8-check capsule validation
  network/
    types.ts             Network entry types, hashing, header redaction
    recorder.ts          CDP Fetch-based network recording
    replayer.ts          CDP Fetch-based network replay (hash+occurrence matching)
  snapshot/
    dom.ts               CDP DOMSnapshot capture
    accessibility.ts     Playwright accessibility tree capture
    screenshot.ts        Playwright screenshot capture
    state.ts             Storage state capture/restore (with SSRF protection)
  telemetry/
    trace.ts             Session trace timeline
  time/
    types.ts             Time virtualizer types
    virtualizer.ts       CDP Emulation virtual time control
  __tests__/             171 unit tests (vitest)
```

## Tooling

- **Build:** tsup (dual ESM/CJS + dts)
- **TypeScript:** 5.7+ (ES2022, NodeNext, strict with noUncheckedIndexedAccess)
- **Test:** Vitest 4.x (`npm test`)
- **Peer dep:** playwright-core >= 1.40.0

## Key Commands

- `npm run build` — Build
- `npm test` — Run all 171 tests
- `npm run typecheck` — Type check
- `npm run lint` — Lint

## Architecture

DBAR captures browser sessions into **determinism capsules** — portable archives containing:
- Environment descriptor (browser, viewport, locale, timezone)
- Seed package (virtual time epoch, RNG seed)
- Network transcript (full request/response with deduplicated bodies)
- Per-step observables (DOM hash, accessibility hash, screenshot hash, network digest)
- Per-step artifacts (full DOM snapshot, accessibility tree, screenshot PNG)

**Capture flow:** CDP virtual time pause → wait quiescence → snapshot observables → resume
**Replay flow:** Restore environment → intercept network via CDP Fetch → step through capsule → compare hashes

## Key Design Decisions

- **CDP-first:** Virtual time and network interception use CDP directly (not Playwright APIs) for maximum control
- **Hash-based comparison:** Steps are compared via SHA-256 hashes, not content diffing
- **Screenshot is advisory:** Screenshot hash mismatches don't fail replay (rendering variance across runs)
- **Network matching:** Uses (requestHash, occurrenceIndex) pairs to serve correct responses for repeated identical requests
- **SSRF protection:** `restoreStorageState()` validates all URLs before navigation

## Known Pitfalls

### TimeVirtualizer quiescence requires onFetchResolved wiring
`waitForQuiescence()` tracks pending CDP Fetch events. Both `NetworkRecorder` and `NetworkReplayer` must call `onFetchResolved` after each fetch resolution, otherwise `pendingFetchCount` grows monotonically and quiescence always times out.

### Capsule serialization is double-base64
`serializeCapsuleArchive()` produces: JSON object (path → base64 file content) → UTF-8 → base64. This avoids a ZIP dependency but means large capsules are ~1.37x the raw size.

### capsuleSizeBytes convergence loop
`buildCapsule()` iterates up to 3 times to stabilize `capsuleSizeBytes` because the JSON representation of the size number changes the manifest size.

## Origin

Extracted from the [Browser Agent Protocol](https://github.com/browseragentprotocol/bap) monorepo to be usable independently of BAP.

## License

Apache-2.0
