# DBAR Phase 1 Audit

Date: 2026-05-04
Repo: `/Users/piyush/GitHub/browser/dbar`
Branch: `fix/e2e-replay`
HEAD: `dcffe37 chore: bump to v0.2.0, add PyPI to release workflow`

## Scope And Constraints

This audit is Phase 1 only. No source, test, docs, workflow, package, or generated file was intentionally modified. The repo was already dirty before the audit; only this `AUDIT.md` file is in scope for this unit.

Required product inputs read before product or architecture judgments:

- `README.md`
- `POSITIONING.md`
- `ROADMAP.md`
- `docs/plans/2026-04-02-dbar-roadmap.md`
- `docs/plans/2026-04-02-dbar-omx-handoff-spec.md`

Repo instructions read:

- `/Users/piyush/GitHub/AGENTS.md`
- `/Users/piyush/GitHub/browser/dbar/AGENTS.md`

Initial `git status --short` showed a dirty tree across root TypeScript, Python, integrations, workflows, docs, and untracked tests/source. I treated all existing changes as someone else's work.

## Executive Summary

DBAR has a coherent product wedge: `failed run -> replay -> first divergence -> reusable regression artifact`. The current codebase is much stronger than a toy proof of concept: root TypeScript build/typecheck/lint/tests pass locally, Python tests pass locally, browser-use and Browserbase unit lanes pass locally, and the public npm package is published at `0.2.0`.

The release is not yet ready to call stable or secure. The biggest blockers are:

1. PyPI claims are not true externally: `https://pypi.org/pypi/dbar/json` returns `404`, and `python3 -m pip index versions dbar` reports no matching distribution.
2. npm audit fails in root and both integration packages due transitive `vite` and `postcss` advisories.
3. Coverage reporting is not configured; Vitest coverage fails because `@vitest/coverage-v8` is missing.
4. Current local CI workflow and remote GitHub CI are out of sync. Local dirty workflow adds Python and integration jobs, but `gh workflow view CI --yaml` still shows only Node 20/22 build/typecheck/test on GitHub.
5. No explicit browser support matrix exists beyond Chromium/CDP assumptions.
6. The CLI can replay capsules, but the automatic `dbar replay` path does not replay user actions between steps; multi-step workflows need `DBAR.startReplay` and caller-driven actions.
7. Capsule sharing is security-sensitive: root TypeScript capsules contain cookies, localStorage, screenshots, and full response bodies; only headers are redacted by default.

Recommended semver target: `0.3.0` for the next significant release while DBAR remains in `0.x`. Do not target `1.0.0` until the release DoD below is closed and the orchestrator explicitly accepts public API stability. Current local and npm version are both `0.2.0`.

## Version Evidence

Local package versions:

- Root npm package: `@pyyush/dbar@0.2.0`
- Python package metadata: `dbar==0.2.0`
- Browser-use integration package: private `@pyyush/dbar-browser-use@0.2.0`
- Browserbase integration package: private `@pyyush/dbar-browserbase@0.2.0`

External registry checks:

- `npm view @pyyush/dbar version time dist-tags --json`: latest is `0.2.0`; versions are `0.1.0`, `0.2.0`; `0.2.0` published 2026-04-02.
- `npm view @pyyush/dbar dist.unpackedSize dist.fileCount dist.integrity --json`: published package has 11 files, 457412 unpacked bytes.
- `python3 -m pip index versions dbar`: `ERROR: No matching distribution found for dbar`.
- `curl -sS -o /dev/null -w '%{http_code}\n' https://pypi.org/pypi/dbar/json`: `404`.

Local generated artifacts are inconsistent with package metadata:

- `python/dist/` contains `dbar-0.2.0` and `dbar-0.3.0` sdists/wheels.
- Root has ignored `pyyush-dbar-0.2.0.tgz`.
- These were not modified or cleaned up.

## Public API Surface Inventory

### Root TypeScript Package

Package entrypoints:

- ESM: `dist/index.js`
- CJS: `dist/index.cjs`
- Types: `dist/index.d.ts`, `dist/index.d.cts`
- Export map exposes only `"."` and `"./package.json"`.
- CLI binary: `dbar -> dist/cli.js`

Top-level exports from `src/index.ts`:

- Capsule types and Zod schemas: `DeterminismCapsule`, `EnvironmentDescriptor`, `SeedPackage`, `InitialState`, `NetworkEntry`, `NetworkTranscript`, `CapsuleStep`, `StepAction`, `StepObservables`, `StepArtifacts`, `CapsuleMetrics`, `CapsuleCookie`, `Divergence`, `DivergenceType`, `StepSnapshot`, `ReplayResult`, `ValidationResult`, plus matching schemas.
- Time: `TimeVirtualizer`, `TimePolicy`, `TimeVirtualizerOptions`, `QuiescenceState`.
- Network: `NetworkRecorder`, `NetworkRecorderOptions`, `NetworkReplayer`, `NetworkReplayerOptions`, `createTranscript`, `hashRequest`, `hashBody`, `hashBuffer`, `redactHeaders`, `isSSE`, `isWebSocket`, mutable transcript types.
- Snapshots: `captureDOMSnapshot`, `captureAccessibilitySnapshot`, `captureScreenshot`, `captureStorageState`, `restoreStorageState`.
- Capsule builder/validator: `buildCapsule`, `serializeCapsuleArchive`, `deserializeCapsuleArchive`, `validateCapsule`, `CapsuleBuildInput`, `CapsuleArchive`.
- Telemetry: `TraceTimeline`, `TraceEntry`.
- Coordinator and SDK: `Coordinator`, `CaptureOptions`, `CaptureSessionState`, `DBAR`, `CaptureSession`, `ReplaySession`, `ReplayOptions`, `ReplayStepResult`.

High-level SDK:

- `DBAR.capture(page, options)` starts capture.
- `CaptureSession.step(label?)`, `finish()`, `abort()`.
- `DBAR.startReplay(page, archive, options)` supports step-by-step replay where the caller interleaves user actions.
- `ReplaySession.step()`, `finish()`.
- `DBAR.replay(page, archive, options)` automatically compares steps but does not replay user actions between steps.
- `DBAR.validate`, `validateFromBlob`, `serialize`, `deserialize`.

### CLI

Commands from `src/cli.ts` and `src/cli/args.ts`:

- `dbar replay <capsule-path> [--cost] [--json]`
- `dbar eval --capsules <dir> --assertions <yaml-path> [--json]`
- `dbar validate <capsule-path>`
- `dbar --help`
- `dbar --version`

Important CLI behavior:

- `dbar replay` launches `playwright-core` Chromium and calls `DBAR.replay`.
- Exit code `1` means blocking divergence.
- `--json` includes `timeToDivergence`, `firstDivergence`, `firstBlockingDivergence`, and divergence details.
- `eval` uses a deliberately minimal YAML parser for a narrow assertions format.

### Capsule Format

Root deterministic capsule manifest:

- `version: "1.0.0"`
- `capsuleProfile: "replay"`
- UUID `id`, ISO `createdAt`
- `environment`: browser build, flags, locale, timezone, viewport, scale, user agent, optional geo/proxy/headers.
- `seeds`: `initialTime`, optional `rngSeed`, optional `orderingSeed`.
- `initialState`: URL, cookies, localStorage, `unsupportedState`.
- `networkTranscript`: `orderingPolicy`, request/response/error entries keyed by `requestHash` and `occurrenceIndex`.
- `steps`: index, optional label/action, observables, artifact paths, warnings.
- `metrics`: step count, network count, unsupported request count, capture overhead, capsule size.

Archive layout:

- `capsule.json`
- `network/<sha256>`
- `snapshots/<step>/dom.json`
- `snapshots/<step>/accessibility.json`
- `snapshots/<step>/screenshot.png`
- optional `traces/<step>.json`

Serialization is base64 JSON of path-to-base64 file content, not zip/tar. This is simple but memory-heavy.

### Python Package

Python exports from `python/dbar/__init__.py`:

- `DBARRecorder`
- `Capsule`
- `__version__`

Python package behavior:

- Recorder/diff evidence lane, not deterministic replay.
- `DBARRecorder.on_step_end(agent)` records browser-use-like history/live state.
- `DBARRecorder.finish()` writes `capsule.json`.
- `Capsule.load(path)`, `Capsule.diff(other)`, `Capsule.summary()`.
- Python capsule manifest format is `version: "0.1.0"` and is not the root TS deterministic capsule format.

Python metadata:

- `requires-python = ">=3.9"`
- optional `browser-use = ["browser-use==0.12.5; python_version >= '3.11'"]`
- dev deps: `pytest`, `pytest-asyncio`

### Integrations

Browser-use integration:

- Private Node sidecar package.
- `capture.ts` connects over CDP to an existing browser-use Chrome session.
- File signals: `.dbar-step`, `.dbar-finish`.
- Captures DOM snapshot, accessibility tree, screenshot, and hashes.
- Manifest declares `captureMode: "snapshot-only"` and limitations: no network recording, no virtual time, no deterministic replay.
- Python `example.py` and `requirements.txt` pin `browser-use==0.12.5` and `langchain-openai==0.1.25`.

Browserbase integration:

- Private Node integration package.
- `capture.ts` creates Browserbase session, connects over CDP, calls root `DBAR.capture`, writes capsule.
- `replay.ts` loads capsule and replays locally.
- `helpers.ts` masks Browserbase `apiKey` query param and parses CLI args.
- Requires `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` for live capture.

## GitHub Issues

GitHub CLI status:

- `gh auth status`: authenticated as `pyyush` with `repo` and `workflow` scopes.
- Remote: `https://github.com/pyyush/dbar.git`.

Open issues:

- `gh issue list --state open --limit 200 --json number,title,labels,assignees,state,updatedAt,url` returned `[]`.
- There are no open issues to label or triage.

Available default labels include `bug`, `documentation`, `duplicate`, `enhancement`, `help wanted`, `good first issue`, `invalid`, `question`, and `wontfix`.

## Verification Results

Environment:

- Node: `v25.8.1`
- npm: `11.11.0`
- `python`: not found
- `python3`: `Python 3.9.6`
- pip: `26.0.1`
- gh: `2.88.0`

Write-scope note:

- I did not run plain `npm install` because it can write `package-lock.json` and `node_modules`, and this unit may only modify `AUDIT.md`.
- I used `npm install --dry-run` to verify install resolution.
- I did not run the default `npm run build` output into repo `dist`; I ran `npm run build -- --out-dir /tmp/dbar-audit-dist`.

Root package:

| Command | Result |
|---|---|
| `npm install --dry-run` | passed, up to date |
| `npm run build -- --out-dir /tmp/dbar-audit-dist` | passed |
| `npm run typecheck` | passed |
| `npm test` | passed: 15 test files, 216 tests |
| `npm run lint` | passed |
| `CI=1 npm exec vitest -- run --coverage --coverage.reportsDirectory=/tmp/dbar-audit-coverage` | failed: missing `@vitest/coverage-v8` |
| `npm pack --dry-run --ignore-scripts` | passed; package size 79.0 kB, unpacked size 388.3 kB, 9 files |

Build output observed in `/tmp/dbar-audit-dist`:

- `index.js`: 57.78 KB
- `index.cjs`: 62.29 KB
- `cli.js`: 72.74 KB
- `index.d.ts`: 81.48 KB
- `index.d.cts`: 81.48 KB
- directory size: 372 KB

Python package:

| Command | Result |
|---|---|
| `python3 -m pip install --dry-run -e './python[dev]'` | passed dry-run; would install `dbar-0.2.0` |
| `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python python3 -m pytest python/tests` | passed: 35 tests |

Important limitation: local Python test ran on Python 3.9.6. CI intends Python 3.10/3.11/3.12 coverage, but those runtimes were not locally exercised in this audit.

Browser-use integration:

| Command | Result |
|---|---|
| `npm --prefix integrations/browser-use install --dry-run` | passed, up to date |
| `npm --prefix integrations/browser-use run typecheck` | passed |
| `npm --prefix integrations/browser-use test` | passed: 1 test file, 16 tests |

Browserbase integration:

| Command | Result |
|---|---|
| `npm --prefix integrations/browserbase install --dry-run` | passed, up to date |
| `npm --prefix integrations/browserbase test` | passed: 1 test file, 17 tests |
| `npm --prefix integrations/browserbase exec tsc -- --noEmit` | passed |

Live integration blockers:

- Browserbase live capture was not run because credentials and external session use are outside audit scope.
- browser-use live agent example was not run because it requires provider API keys and live browser-use execution.
- No browser matrix was run.

## Test Coverage

No current coverage percentage is available.

Exact blocker:

- `CI=1 npm exec vitest -- run --coverage --coverage.reportsDirectory=/tmp/dbar-audit-coverage` fails with `MISSING DEPENDENCY Cannot find dependency '@vitest/coverage-v8'`.

There is no coverage script in root `package.json`, and `vitest.config.ts` does not configure coverage.

Python has `pytest-cov` installed in the local environment, but the project does not define a coverage gate or coverage command.

## Dependency Audit

Root `npm audit --json`:

- exit code `1`
- total vulnerabilities: 2
- moderate: `postcss <8.5.10`, GHSA-qx2v-qp2m-jg93
- high: `vite 8.0.0 - 8.0.4`, GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583
- root lock has `vite@8.0.2` and `postcss@8.5.8`
- fix available

Browser-use integration `npm audit --json`:

- exit code `1`
- same `postcss` and `vite` advisories
- integration lock has `vite@8.0.3`
- fix available

Browserbase integration `npm audit --json`:

- exit code `1`
- same `postcss` and `vite` advisories
- integration lock has `vite@8.0.3`
- fix available

Python audit:

- `pip-audit` was not installed directly.
- `uvx pip-audit python --desc off --progress-spinner off --format json` passed with no known vulnerabilities, but warned that `python/pyproject.toml` does not contain a default `dependencies` list. It did not audit optional browser-use dependencies.
- `uvx pip-audit --requirement integrations/browser-use/requirements.txt --desc off --progress-spinner off --format json` failed before audit. Exact blocker: pip-audit attempted to create a temp venv and `ensurepip` died with `SIGABRT`.

Security interpretation:

- npm advisories affect dev/build/test transitive dependencies, not root runtime dependency `zod`.
- Fixing them likely requires build/test toolchain bumps. Per orchestrator constraint, do not lock build-tool changes without routing the decision back.
- Python optional/browser-use dependency audit remains blocked and must be rerun before release.

## CI Status

Local dirty `.github/workflows/ci.yml` currently defines:

- root TypeScript job on Node 20 and 22: `npm ci`, build, typecheck, test, lint.
- Python job on 3.10, 3.11, 3.12: editable install and pytest.
- browser-use job on Node 22: install, typecheck, test.
- browserbase job on Node 22: install, test.

Remote GitHub CI does not match the local dirty workflow:

- `gh workflow view CI --yaml` shows only a `build` job over Node 20 and 22 with `npm ci`, build, typecheck, test.
- No remote Python, browser-use, browserbase, or lint jobs appear in the currently published workflow YAML.
- Latest remote CI run inspected: `23922809847`, created 2026-04-02, conclusion `success`.
- Jobs in that run: `build (20)` and `build (22)`, both successful.

Release workflow local dirty state:

- Adds a release verify job, npm publish, and PyPI publish.
- Release hygiene check scans tracked files for internal-only artifacts.
- `git ls-files` hygiene pattern returned no tracked internal-only files.
- Ignored internal/operator files are present in the working tree, but not tracked.

Browser support gap:

- No explicit cross-browser Playwright matrix exists.
- The implementation is CDP/Chromium-first by design today.
- Do not add or lock browser matrix decisions without orchestrator approval because dbar and useid share browser constraints.

## Known Bugs And Stability Gaps

1. PyPI distribution missing.
   Docs, badges, install instructions, and release workflow imply PyPI package availability, but PyPI returns 404 and pip cannot find `dbar`.

2. Multi-step replay CLI is incomplete for the core incident loop.
   `DBAR.startReplay` supports caller-driven multi-step replay, but `dbar replay` uses automatic replay and does not replay user actions between steps. Multi-step capsules can diverge for expected reasons unless users write their own replay harness.

3. Capsule privacy is not release-safe.
   Root capsules store cookies, localStorage, screenshots, and full network response bodies. Header redaction exists, and restore URL validation has SSRF protections, but there is no body/storage/screenshot redaction workflow or safe-share policy.

4. Unsupported browser state remains advisory.
   `sessionStorage`, IndexedDB, and service workers are listed as unsupported state. This is honest, but it limits replay fidelity on production sites.

5. Unsupported traffic is limited.
   WebSockets and SSE are detected as unsupported. QUIC, service worker fetches, cache behavior, downloads/uploads, auth prompts, workers, and cross-target traffic need explicit support boundaries.

6. Network hashing may miss content-affecting request dimensions.
   Request hashing includes method, canonical URL, selected deterministic headers, and post data. It intentionally excludes cookies/auth headers after redaction, which is safer but can conflate server behavior where those values affect content.

7. Environment capture is shallow.
   `browserFlags` is empty, locale/timezone are hard-coded defaults, device scale factor is fixed to 1, and OS image hash is optional. Browserbase replay partly reconstructs viewport/locale/timezone/user agent, but full environment fidelity is not locked.

8. Browser binary availability is not checked.
   The CLI imports `playwright-core` and launches Chromium, but `playwright-core` does not install browser binaries by itself. First-run CLI failures may be confusing when Chromium is absent.

9. Coverage gate is absent.
   Tests are numerous and passing locally, but there is no coverage percentage or minimum coverage gate.

10. CI workflow state is split between local dirty files and GitHub.
    The audited local workflow is broader than the remote workflow. Current GitHub success only proves the older Node 20/22 lane.

11. Live integration confidence is low.
    Browserbase and browser-use unit tests pass, but live Browserbase capture/replay and live browser-use example were not executed.

12. Generated and operator artifacts are present.
    Ignored `dist/`, `python/dist/`, `node_modules/`, `.omx/`, `.pilot/`, `.dev-session/`, `.staff-engineer-state.json`, and tarballs exist in the working tree. They are not tracked, but they increase operator confusion and stale-artifact risk.

## Docs Gap Analysis

Docs strengths:

- README, positioning, roadmap, and handoff spec consistently frame DBAR as replayable proof for browser workflows.
- README now distinguishes Playwright SDK, browser-use, and Browserbase lanes.
- Python README honestly says the Python lane is recorder/diff only, not deterministic replay.
- Browser-use README honestly calls the sidecar observe-only and no deterministic replay.
- Browserbase README includes a useful security notice about capsule sensitivity.
- README includes capture-on-failure and replay examples.

Docs gaps against release DoD:

- PyPI install instructions are currently false externally.
- No production-readiness checklist exists.
- No browser support matrix or unsupported browser mode table exists.
- No explicit "capsule contains secrets" warning in the root README near the first capsule example.
- No redaction/safe-sharing guide exists.
- No CI recipe that captures on failure and replays as a regression fixture is tested and documented end to end.
- No CLI guidance explains that `dbar replay` is single-actionless automatic replay and that multi-step workflows require `DBAR.startReplay`.
- No docs define performance budgets for capsule size, capture overhead, replay latency, or memory.
- No browser-harness interop adapter/example docs exist yet.

## Repo Hygiene Gap Analysis

Current hygiene facts:

- Repo is dirty across 32 tracked files and several untracked files/directories before this audit.
- Untracked release-adjacent files include `CHANGELOG.md`, `eslint.config.js`, new replay tests, and `src/replay/`.
- Ignored generated/operator artifacts exist: `dist/`, `python/dist/`, `pyyush-dbar-0.2.0.tgz`, `.omx/`, `.pilot/`, `.dev-session/`, `.staff-engineer-state.json`, `node_modules/`, integration `node_modules/`, Python caches.
- `python/dist/` contains stale `0.3.0` artifacts while local metadata is `0.2.0`.
- `npm pack --dry-run --ignore-scripts` succeeded only because a `dist/` directory already exists locally. The pack result observed locally has 9 files and 388.3 kB unpacked, while npm registry metadata for published `0.2.0` reports 11 files and 457412 unpacked bytes.

Release hygiene check from local `release.yml`:

- The tracked-file internal artifact check currently returns no matches.
- Ignored internal files are present locally but not tracked.

Hygiene gaps against release DoD:

- Need a clean, checkpointed branch before release verification.
- Need generated artifacts removed or clearly regenerated during release only.
- Need decide whether `CHANGELOG.md` and `eslint.config.js` are intended tracked release files.
- Need ensure package dry-run is run from a clean build, not stale local `dist`.
- Need remote CI workflow to match intended local CI before claiming matrix coverage.

## Performance Hot Paths

Bundle/package:

- Audit build to `/tmp/dbar-audit-dist`: 372 KB total.
- Root JS outputs: `index.js` 57.78 KB, `index.cjs` 62.29 KB, `cli.js` 72.74 KB.
- Type declarations dominate: `index.d.ts` and `index.d.cts` are 81.48 KB each.
- Package dry-run: 79.0 KB tarball, 388.3 KB unpacked.

Capture hot paths:

- Every step captures `outerHTML`, CDP DOMSnapshot, full AX tree, and full-page PNG.
- Screenshot capture is full-page by default and likely dominates latency and artifact size on long pages.
- Network recorder intercepts request and response stages for all URLs and calls `Fetch.getResponseBody`, which can be expensive on large assets.
- Response bodies are base64 encoded before deduplication into archive files.

Replay hot paths:

- Network replay lookup is O(1) by `requestHash:occurrenceIndex`.
- Every replay step captures fresh DOM, accessibility, screenshot, and network digest.
- Screenshot hashing is advisory by default, but screenshot capture still happens during comparison.
- Quiescence polling is real-time 50 ms loops up to 10 seconds.

Memory/capsule hot paths:

- `CapsuleArchive.files` holds all artifacts in memory.
- `serializeCapsuleArchive` materializes every file as base64 inside one JSON object, then base64 encodes the whole JSON again.
- Large production sessions can have high peak memory: raw buffers, per-file base64 strings, JSON string, and final base64 blob can coexist.

Browser-package considerations:

- `playwright-core` is a peer dependency; browsers are not bundled.
- CLI assumes Chromium can launch.
- Implementation is CDP-specific and should not claim Firefox/WebKit support.

## Browser-Harness Decision

Orchestrator-reviewed decision for dbar:

- Interoperate only.
- Approved next-release scope: optional adapter, example, and capture-on-failure workflow.
- No hard dependency.
- No backend support.
- No release coupling without human confirmation.

Audit implication:

- Do not add browser-harness as a dependency or CI release gate in this phase.
- A useful next task is a small optional example showing how a browser-harness failure emits a DBAR capsule and how the capsule is retained as a regression artifact.

## Release DoD Used For This Audit

| ID | DoD item | Current status |
|---|---|---|
| DOD-1 | Version target and registry truth are clear | Partial: npm true, PyPI false, target needs orchestrator acceptance |
| DOD-2 | Public API is inventoried, stable, and documented | Partial: inventoried here; stability needs explicit review |
| DOD-3 | Core replay correctness and first-divergence behavior are trusted | Partial: tests pass; multi-step CLI and live browser gaps remain |
| DOD-4 | Capture-on-failure to regression artifact workflow is real | Partial: README example exists; no tested CI/reference workflow |
| DOD-5 | Python/browser-use/Browserbase stories are honest and verified | Partial: docs mostly honest; live integration verification missing; PyPI absent |
| DOD-6 | GitHub issues are triaged | Pass: no open issues |
| DOD-7 | Coverage report and threshold exist | Fail: coverage tooling missing |
| DOD-8 | Dependency/security audit is clean or accepted | Fail: npm audit failures; Python optional audit blocked; redaction gaps |
| DOD-9 | CI matrix covers intended runtimes and browser support truthfully | Partial: local workflow broader than remote; no browser matrix |
| DOD-10 | Docs meet production adoption bar | Partial: strong narrative; missing safety, support, CI, and harness docs |
| DOD-11 | Repo/release hygiene is clean | Partial: dirty tree and ignored stale artifacts |
| DOD-12 | Performance budgets and hot paths are known | Partial: hot paths identified; no budgets/gates |
| DOD-13 | Browser-harness scope is routed correctly | Pass: interoperate-only decision documented here |

DoD delta: 11 incomplete release items: DOD-1, DOD-2, DOD-3, DOD-4, DOD-5, DOD-7, DOD-8, DOD-9, DOD-10, DOD-11, DOD-12.

## Prioritized Work List

P0. Fix registry truth and release target.

- Maps to DOD-1, DOD-5, DOD-10.
- Decide target version: recommended `0.3.0`.
- Either publish `dbar` to PyPI or remove/soften all PyPI claims before release.
- Verify npm and PyPI versions externally immediately before ship.

P0. Resolve security audit failures through orchestrator-routed toolchain decision.

- Maps to DOD-8, DOD-9.
- npm audit failures require updating transitive `vite`/`postcss` through Vitest/tsup/tooling dependency movement.
- Because build-tool changes affect CI/browser constraints shared with useid, route exact dependency bump proposal to orchestrator before locking.
- Rerun root, browser-use, and browserbase `npm audit`.
- Rerun Python optional dependency audit after fixing the `pip-audit` temp venv blocker.

P0. Add coverage tooling and a release coverage report.

- Maps to DOD-7.
- Add `@vitest/coverage-v8` or approved equivalent.
- Add a noninteractive coverage command.
- Decide initial threshold after first report; do not invent a high threshold without seeing real coverage.

P0. Align local and remote CI.

- Maps to DOD-9, DOD-11.
- Confirm whether the dirty local CI matrix should be committed/pushed.
- Ensure GitHub shows Node 20/22, Python 3.10/3.11/3.12, browser-use, browserbase, and lint before claiming matrix success.
- Do not add cross-browser matrix without orchestrator approval.

P1. Make multi-step replay workflow first-class.

- Maps to DOD-3, DOD-4, DOD-10.
- Either document `dbar replay` as single-step/actionless replay or add a replay plan/action harness format.
- Provide a tested path from failed run capsule to first blocking divergence.

P1. Add safe-share and redaction story.

- Maps to DOD-8, DOD-10.
- Root README needs an early warning that capsules can contain secrets.
- Add redaction options for response bodies, cookies/localStorage, screenshots, and URL query params.
- Add validation warnings for unredacted sensitive material where feasible.

P1. Turn capture-on-failure into a regression artifact recipe.

- Maps to DOD-4, DOD-10, DOD-13.
- Add a tested Playwright example or CI recipe that captures only on failure, validates capsule, replays it, and stores it as an artifact.
- Add optional browser-harness interop example only, with no dependency or release coupling.

P1. Clarify browser/runtime support.

- Maps to DOD-3, DOD-9, DOD-10.
- Document Chromium/CDP-only support.
- Add explicit unsupported modes: Firefox/WebKit, service workers, IndexedDB, sessionStorage, WebSockets/SSE, downloads/uploads, auth prompts, workers, and browser binary absence.
- Add a CLI preflight error for missing Chromium if practical.

P1. Clean release hygiene.

- Maps to DOD-11.
- Start from a clean checkpoint.
- Remove or quarantine stale generated artifacts before release verification.
- Ensure package dry-run is run after a fresh build, not against stale local `dist`.
- Confirm tracked public release tree does not include operator-only docs or state.

P2. Add performance budgets.

- Maps to DOD-12.
- Track capsule size, capture overhead per step, replay latency per step, and peak memory on a production-shaped fixture.
- Consider streaming/zip archive serialization to reduce peak memory.
- Consider optional screenshot capture or screenshot compare capture gating.

P2. Strengthen live integration evidence.

- Maps to DOD-5, DOD-9.
- Add a credential-gated Browserbase smoke workflow that is skipped safely without secrets.
- Add a browser-use example verification path with mocked/providerless mode if possible.
- Keep browser-use docs observe-only.

## Final Audit Verdict

DBAR is directionally strong and locally healthy at the unit-test level, but it is not yet release-clean. The next release should be treated as a `0.3.0` hardening release unless the orchestrator explicitly chooses a larger public-stability milestone. The highest-value path is to close PyPI truth, npm audit, coverage, remote CI alignment, safe capsule sharing, and multi-step replay workflow gaps before writing `RELEASE_PLAN.md`.
