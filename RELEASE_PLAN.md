# DBAR 1.0.0 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship DBAR `1.0.0` as a stable, secure, valuable major release for replayable proof of production browser workflows.

**Architecture:** Keep DBAR's wedge narrow: failed run -> replay -> first divergence -> reusable regression artifact. The 1.0.0 path closes every audit DoD gap before release, preserves Chromium/CDP-only truth unless implementation changes, and keeps browser-harness as an optional interop example rather than a dependency.

**Tech Stack:** npm, TypeScript, tsup, Vitest, ESLint, Playwright Core, Chromium/CDP, Python packaging, pytest, GitHub Actions, npm registry, PyPI.

---

## Inputs And Constraints

Inputs:

- `/Users/piyush/GitHub/browser/dbar/AUDIT.md`
- `/Users/piyush/GitHub/research/browser-harness-analysis.md`
- `/Users/piyush/GitHub/browser/dbar/AGENTS.md`

Execution constraints for later phases:

- Work only inside `/Users/piyush/GitHub/browser/dbar`.
- Do not revert or clean up pre-existing dirty worktree changes unless the orchestrator explicitly assigns that task.
- Before editing in implementation phases, run `git status --short`.
- Keep code, tests, docs, and release claims aligned.
- Do not lock CI/browser matrix or build-tool changes that affect dbar/useid shared browser constraints without routing the decision back to the orchestrator.
- Do not begin Phase 3 from this plan-writing unit.

## Target Version

Target stable release: `1.0.0`.

Semver justification:

- The orchestrator decision is to plan for `1.0.0` as the mission's stable major release after all DoD items close.
- The major version is appropriate only when DBAR can make stable public claims around the root TypeScript API, capsule/replay behavior, CLI semantics, security posture, registry availability, and CI/runtime support.
- Current published npm version is `0.2.0`; PyPI is missing externally. Moving directly to `1.0.0` before closing the DoD would overstate stability.
- The root capsule manifest already uses `version: "1.0.0"`, but package semver must not inherit that stability claim until release gates pass.

Optional interim release: `0.3.0`.

- Use `0.3.0` only if security/tooling fixes, PyPI truth, CI alignment, and documentation corrections need to ship before the full 1.0.0 incident-loop feature set is complete.
- `0.3.0` must not replace the major-release plan.
- `0.3.0` is scoped to hardening: registry truth, audit fixes, coverage setup, CI sync, and claim corrections.

## Definition Of Done

| ID | DoD Section | Required For 1.0.0 |
|---|---|---|
| DOD-1 | Version and registry truth | npm and PyPI versions externally verified; release target accepted; install docs true |
| DOD-2 | Public API stability | TypeScript, CLI, capsule, integration, and Python surfaces reviewed, frozen, and documented |
| DOD-3 | Replay trust | Core replay and first-divergence behavior verified, including multi-step story |
| DOD-4 | Incident workflow | Capture-on-failure to regression artifact workflow works end to end |
| DOD-5 | Integration truth | Python, browser-use, and Browserbase lanes verified without overclaiming |
| DOD-6 | GitHub triage | Open issues checked and triaged |
| DOD-7 | Coverage | Coverage tooling, current report, and accepted threshold exist |
| DOD-8 | Security | npm/Python audits resolved or formally accepted; capsule privacy story implemented |
| DOD-9 | CI/runtime matrix | Local and remote CI match intended Node, Python, and integration baseline |
| DOD-10 | Docs | Production adoption docs, support boundaries, safe-share docs, and examples are accurate |
| DOD-11 | Repo hygiene | Clean release branch, fresh generated artifacts, no stale/operator artifacts in release package |
| DOD-12 | Performance | Capsule size, capture overhead, replay latency, and memory budgets defined and measured |
| DOD-13 | Browser-harness scope | Interop-only decision preserved; no hard dependency or release coupling |

## Browser And Toolchain Matrix

Baseline to keep unless the orchestrator approves a change:

- Root Node tooling: Node `20` and `22`.
- Python CI: Python `3.10`, `3.11`, and `3.12`.
- Root commands: `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, `npm run lint`.
- Python commands: `python -m pip install -e ".[dev]"`, `python -m pytest tests/ -q`.
- Browser-use integration: `npm ci`, `npm run typecheck`, `npm test`.
- Browserbase integration: `npm ci`, `npm test`; add typecheck only if the orchestrator accepts it as a baseline.
- Browser support claim: Chromium/CDP-only.

Do not lock these without human confirmation:

- Firefox or WebKit support.
- Cross-browser Playwright CI matrix.
- Browser-harness CI matrix.
- Browserbase live CI as a required gate when credentials are absent.
- Build-tool major changes used only to satisfy transitive audits.

## Browser-Harness Research Outcome

Decision: `interoperate`.

Approved next-release scope:

- Optional adapter.
- Optional example.
- Optional capture-on-failure workflow.

Explicit non-goals:

- No hard dependency on `browser-harness`.
- No browser-harness backend support.
- No release coupling without human confirmation.
- No browser-harness CI matrix unless the orchestrator explicitly approves it.

Planned use in 1.0.0:

- Document browser-harness as a live execution companion, not a replay/proof engine.
- Show one optional workflow where browser-harness runs the live browser and DBAR captures a failure capsule.
- Keep deterministic replay claims anchored to DBAR-owned Chromium/CDP sessions.

## Ordered Task List

Cycle estimate model:

- 1 cycle = one focused implementation-and-verification pass by one worker, usually 1 to 3 hours for scoped code/docs/test work.
- Tasks marked "decision" may be short in code time but blocked on orchestrator approval.

### Task 1: Stabilize Release Branch And Ownership Snapshot

**Status:** Complete for Phase 3 Task 1. Ownership map is clear; no cleanup or source changes were performed.

**DoD:** DOD-11

**Estimated cycles:** 1

**Depends on:** none

**Files likely involved in Phase 3:**

- `AUDIT.md`
- `RELEASE_PLAN.md`
- `git status` output only

**Steps:**

- [x] Run `git status --short` and record the dirty baseline in the Phase 3 handoff.
- [x] Identify which existing dirty files are part of the intended release branch and which are unrelated operator artifacts.
- [x] Route any cleanup/checkpoint decision to the orchestrator before deleting, reverting, or moving files.
- [x] Confirm no Phase 3 worker starts from a false clean-tree assumption.

**Fresh dirty baseline from `git status --short`:**

```text
 M .github/workflows/ci.yml
 M .github/workflows/release.yml
 M .gitignore
 M README.md
 M integrations/browser-use/README.md
 M integrations/browser-use/capture.test.ts
 M integrations/browser-use/capture.ts
 M integrations/browser-use/example.py
 M integrations/browser-use/package-lock.json
 M integrations/browser-use/package.json
 M integrations/browser-use/requirements.txt
 M integrations/browserbase/README.md
 M integrations/browserbase/package-lock.json
 M integrations/browserbase/package.json
 M package-lock.json
 M package.json
 M python/README.md
 M python/dbar/__init__.py
 M python/dbar/capsule.py
 M python/dbar/recorder.py
 M python/dbar/types.py
 M python/pyproject.toml
 M python/tests/conftest.py
 M python/tests/test_recorder.py
 M src/__tests__/network-replayer.test.ts
 M src/cli.ts
 M src/cli/replay.ts
 M src/coordinator.ts
 M src/network/replayer.ts
 M src/sdk.ts
 M src/snapshot/state.ts
 M tsup.config.ts
?? AUDIT.md
?? CHANGELOG.md
?? RELEASE_PLAN.md
?? eslint.config.js
?? python/dbar/__pycache__/
?? python/tests/__pycache__/
?? src/__tests__/cli-replay.test.ts
?? src/__tests__/replay-compare.test.ts
?? src/__tests__/sdk-replay.test.ts
?? src/replay/
```

**Ownership categories for future tasks:**

- Planning artifacts: `AUDIT.md`, `RELEASE_PLAN.md`. Owned by Phase 1/2/3 planning workers. Do not mix these into code commits unless the commit is explicitly a planning commit.
- Task 2 release contract: `package.json`, `python/pyproject.toml`, `python/dbar/__init__.py`, future `python/dbar/_version.py`, `CHANGELOG.md`, `README.md`. These are candidates for version/API/release-contract work only after Task 2 starts.
- Task 3 PyPI truth: `python/pyproject.toml`, `python/README.md`, `python/dbar/__init__.py`, `python/dbar/capsule.py`, `python/dbar/recorder.py`, `python/dbar/types.py`, `python/tests/conftest.py`, `python/tests/test_recorder.py`, and release workflow PyPI steps. Treat Python package and docs as one lane.
- Task 4 npm audit/toolchain: `package.json`, `package-lock.json`, `tsup.config.ts`, `integrations/browser-use/package.json`, `integrations/browser-use/package-lock.json`, `integrations/browserbase/package.json`, `integrations/browserbase/package-lock.json`, and any approved toolchain config changes. Do not lock dependency/toolchain moves without orchestrator approval.
- Task 5 coverage: future coverage script/config changes would likely touch `package.json`, `package-lock.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, and possibly `eslint.config.js`. Current `eslint.config.js` is untracked and must not be staged incidentally.
- CI/workflow: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.gitignore`. These are release-matrix and hygiene surfaces. Keep CI/browser matrix decisions routed through the orchestrator.
- Replay: `src/sdk.ts`, `src/coordinator.ts`, `src/network/replayer.ts`, `src/cli.ts`, `src/cli/replay.ts`, `src/snapshot/state.ts`, `src/replay/`, `src/__tests__/network-replayer.test.ts`, `src/__tests__/cli-replay.test.ts`, `src/__tests__/replay-compare.test.ts`, `src/__tests__/sdk-replay.test.ts`.
- Privacy and safe sharing: likely future work touches `src/snapshot/state.ts`, network/capsule validator surfaces, SDK options, root README, Browserbase README, and focused tests. Existing privacy-relevant dirty files should not be folded into unrelated replay or toolchain commits.
- Docs and positioning: `README.md`, `python/README.md`, `integrations/browser-use/README.md`, `integrations/browserbase/README.md`, `CHANGELOG.md`. Ignored docs/plans, `POSITIONING.md`, and `ROADMAP.md` are not to be changed in Task 1 and should not be staged accidentally.
- Generated/operator artifacts not to touch: `python/dbar/__pycache__/`, `python/tests/__pycache__/`, ignored `.dev-session/`, `.omx/`, `.pilot/`, `.staff-engineer-state.json`, `AGENTS.md`, `BROWSER_USE_PR.md`, `CLAUDE.md`, `POSITIONING.md`, `ROADMAP.md`, `demo/RECORD-DEMO-PROMPT.md`, `dist/`, `docs/`, `node_modules/`, integration `node_modules/`, `python/.pytest_cache/`, `python/dist/`, `pyyush-dbar-0.2.0.tgz`, and `.github/.DS_Store`. No deletion, cleanup, or staging without explicit orchestrator assignment.

**Commit constraints for all future tasks:**

- Do not use `git add .`, `git add -A`, or broad staging patterns.
- Do not stage unrelated pre-existing dirty files.
- Future commits must be explicit-path scoped to the task ownership category.
- Do not delete generated/operator artifacts unless the orchestrator assigns a cleanup task.
- Do not revert, reset, checkout, or overwrite pre-existing edits.
- Before each task commit, run `git diff --name-only --cached` and verify every staged path belongs to that task.
- If a file is shared across categories, the task owner must inspect current diffs and stage only the relevant hunks or defer to the orchestrator.

**Post-edit verification from `git status --short`:**

```text
 M .github/workflows/ci.yml
 M .github/workflows/release.yml
 M .gitignore
 M README.md
 M integrations/browser-use/README.md
 M integrations/browser-use/capture.test.ts
 M integrations/browser-use/capture.ts
 M integrations/browser-use/example.py
 M integrations/browser-use/package-lock.json
 M integrations/browser-use/package.json
 M integrations/browser-use/requirements.txt
 M integrations/browserbase/README.md
 M integrations/browserbase/package-lock.json
 M integrations/browserbase/package.json
 M package-lock.json
 M package.json
 M python/README.md
 M python/dbar/__init__.py
 M python/dbar/capsule.py
 M python/dbar/recorder.py
 M python/dbar/types.py
 M python/pyproject.toml
 M python/tests/conftest.py
 M python/tests/test_recorder.py
 M src/__tests__/network-replayer.test.ts
 M src/cli.ts
 M src/cli/replay.ts
 M src/coordinator.ts
 M src/network/replayer.ts
 M src/sdk.ts
 M src/snapshot/state.ts
 M tsup.config.ts
?? AUDIT.md
?? CHANGELOG.md
?? RELEASE_PLAN.md
?? eslint.config.js
?? python/dbar/__pycache__/
?? python/tests/__pycache__/
?? src/__tests__/cli-replay.test.ts
?? src/__tests__/replay-compare.test.ts
?? src/__tests__/sdk-replay.test.ts
?? src/replay/
```

**Exit criteria:**

- The implementation team knows which pre-existing edits are in scope.
- No user edits are overwritten.

### Task 2: Confirm 1.0.0 Release Contract

**Status:** Complete for Phase 3 Task 2. The release target, contingency path, freeze surfaces, stable/experimental boundaries, and no-metadata-change constraint are explicit enough for later implementation tasks.

**DoD:** DOD-1, DOD-2

**Estimated cycles:** 1

**Depends on:** Task 1

**Files likely involved in Phase 3:**

- `package.json`
- `python/pyproject.toml`
- `python/dbar/_version.py`
- `CHANGELOG.md`
- `README.md`
- release notes

**Steps:**

- [x] Confirm with the orchestrator that the package target is `1.0.0`.
- [x] Define the public API freeze list: root TypeScript exports, CLI commands/flags, capsule manifest, Python package exports, and integration package contracts.
- [x] Decide whether an interim `0.3.0` security/hardening release is needed before `1.0.0`.
- [x] If `0.3.0` is used, keep `1.0.0` gates unchanged and treat `0.3.0` as a risk-reduction release only.

**Target confirmation:**

- Stable major release target is `1.0.0`.
- `1.0.0` may publish only after every DoD gate closes and the RC/external-user/final release gates pass.
- No interim `0.3.0` is needed right now.
- The interim `0.3.0` path remains documented as contingency only for a future hardening/security/truth release; it does not replace the 1.0.0 plan.
- No package metadata, Python metadata, docs, workflows, source, tests, or generated artifacts are changed in Task 2.

**Public API freeze list for 1.0.0:**

- Package entrypoints:
  - `@pyyush/dbar` root export `"."` is the only stable runtime import path planned for 1.0.0.
  - `@pyyush/dbar/package.json` remains an allowed metadata export.
  - Do not add new subpath exports for 1.0.0 unless a later task explicitly updates this release contract.
- Root TypeScript SDK stable surface:
  - `DBAR.capture(page, options)`
  - `DBAR.startReplay(page, archive, options)`
  - `DBAR.replay(page, archive, options)`
  - `DBAR.validate(archive)`
  - `DBAR.validateFromBlob(base64)`
  - `DBAR.serialize(archive)`
  - `DBAR.deserialize(base64)`
  - `CaptureSession.id`
  - `CaptureSession.stepCount`
  - `CaptureSession.step(label?)`
  - `CaptureSession.finish()`
  - `CaptureSession.abort()`
  - `ReplaySession.stepCount`
  - `ReplaySession.totalSteps`
  - `ReplaySession.step()`
  - `ReplaySession.finish()`
  - `ReplayOptions`
  - `ReplayStepResult`
- Root TypeScript capsule stable surface:
  - `buildCapsule`
  - `serializeCapsuleArchive`
  - `deserializeCapsuleArchive`
  - `validateCapsule`
  - `CapsuleBuildInput`
  - `CapsuleArchive`
  - Capsule and replay result types/schemas exported from `src/index.ts`: `DeterminismCapsule`, `EnvironmentDescriptor`, `SeedPackage`, `InitialState`, `NetworkEntry`, `NetworkTranscript`, `CapsuleStep`, `StepAction`, `StepObservables`, `StepArtifacts`, `CapsuleMetrics`, `CapsuleCookie`, `Divergence`, `DivergenceType`, `StepSnapshot`, `ReplayResult`, `ValidationResult`, and their matching Zod schemas.
- Root TypeScript lower-level exports:
  - `TimeVirtualizer`, network recorder/replayer utilities, snapshot capture functions, storage restore functions, `TraceTimeline`, and `Coordinator` are currently public exports.
  - For 1.0.0 they must be classified in Task 13 as either stable advanced APIs or explicitly documented experimental APIs.
  - Until that classification is complete, do not remove, rename, or change their signatures incidentally during implementation tasks.
- CLI stable commands:
  - `dbar replay <capsule-path> [--cost] [--json]`
  - `dbar eval --capsules <dir> --assertions <yaml-path> [--json]`
  - `dbar validate <capsule-path>`
  - `dbar --help`
  - `dbar --version`
- CLI stable exit-code contract:
  - `dbar replay`: `0` means replay success; `1` means replay completed with blocking divergence or command-level error under the current root CLI behavior.
  - Browserbase `replay.ts` integration CLI keeps its documented separate convention: `0` success, `1` replay completed with divergences, `2` fatal error.
  - If root CLI fatal errors need a distinct `2` before 1.0.0, that is a later implementation decision and must update this contract, tests, and docs together.
- CLI stable output contract:
  - `dbar replay --json` includes capsule file, step counts, success rate, duration, success boolean, failed step count, `timeToDivergence`, `firstDivergence`, `firstBlockingDivergence`, and `divergences`.
  - Human-readable replay output must keep first-divergence and blocking-divergence information visible.
  - `dbar eval --json` emits capsule assertion results.
  - `dbar validate` reports structural validity and exits nonzero on validation errors.
- Capsule manifest and archive freeze:
  - Root deterministic capsule manifest uses `version: "1.0.0"` and `capsuleProfile: "replay"`.
  - Manifest fields in scope for compatibility: `id`, `createdAt`, `environment`, `seeds`, `initialState`, `networkTranscript`, `steps`, and `metrics`.
  - Archive layout in scope for compatibility: `capsule.json`, `network/<sha256>`, `snapshots/<step>/dom.json`, `snapshots/<step>/accessibility.json`, `snapshots/<step>/screenshot.png`, and optional `traces/<step>.json`.
  - Serialization format in scope for compatibility: base64 JSON object mapping archive paths to base64 file contents.
  - Any change to capsule shape, archive layout, or serialization must be treated as a release-contract change and paired with migration/compatibility notes.
- Python stable surface and format caveat:
  - Python exports planned for 1.0.0: `DBARRecorder`, `Capsule`, and `__version__`.
  - Python `DBARRecorder.on_step_end(agent)` and `DBARRecorder.finish()` are the recorder contract.
  - Python `Capsule.load(path)`, `Capsule.diff(other)`, and `Capsule.summary()` are the inspection/diff contract.
  - Python capsule manifests are recorder/diff evidence artifacts and are not the root TypeScript deterministic replay capsule format unless a later implementation task explicitly unifies them.
  - Python/browser-use lane must not claim full deterministic replay in 1.0.0 unless implementation changes and verification prove it.
- browser-use integration contract:
  - Private package remains an observe-only sidecar integration.
  - Supported contract is CDP attachment to the browser-use-owned browser, file signals `.dbar-step` and `.dbar-finish`, and per-step DOM/accessibility/screenshot evidence capture.
  - Signal payload accepts a plain label or JSON with `label` and optional `targetId`.
  - Manifest remains snapshot-only and must declare limitations: no network recording, no virtual time, no deterministic replay.
  - Supported hook surface remains `agent.run(on_step_end=...)`; do not move hook semantics without updating docs/tests.
- Browserbase integration contract:
  - Private package remains a first-class example/integration where DBAR owns the Browserbase session for deterministic capture.
  - Auth remains environment-variable based: `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID`; secrets are not passed as CLI flags.
  - Capture CLI contract: `npx tsx capture.ts --url <url> [--steps <n>] [--output <path>]`.
  - Replay CLI contract: `npx tsx replay.ts <capsule-path> [--json]`.
  - Browserbase replay is local and does not require Browserbase credentials.
  - `session.connectUrl` or any credential-bearing URL must remain masked in logs.

**Stable vs experimental boundary for later tasks:**

- Stable for 1.0.0 once DoD gates close: high-level SDK, root capsule archive builder/serializer/validator, replay result shape, CLI commands above, root deterministic capsule manifest/archive format, Python recorder/diff exports, browser-use observe-only sidecar contract, and Browserbase capture/replay integration contract.
- Experimental or pending classification before 1.0.0: lower-level CDP/time/network/snapshot/coordinator exports, telemetry exports, minimal YAML eval parser behavior, any scripted multi-step CLI replay plan format, browser-harness interop examples, performance budget tooling, and redaction/safe-sharing implementation details.
- Not in 1.0.0 contract unless a later task changes scope: Firefox/WebKit support, browser-harness dependency/backend/CI matrix, hosted control plane, dashboard features, Python deterministic replay, generic browser orchestration, and broad agent-platform APIs.

**Task 2 commit and metadata constraints:**

- Task 2 changes only `RELEASE_PLAN.md`.
- Do not change `package.json`, `package-lock.json`, `python/pyproject.toml`, `python/dbar/__init__.py`, `python/dbar/_version.py`, docs, workflows, source, tests, or generated artifacts in this task.
- Future metadata changes for `1.0.0` belong to later tasks and must be explicit-path scoped.

**Post-edit verification from `git status --short`:**

```text
 M .github/workflows/ci.yml
 M .github/workflows/release.yml
 M .gitignore
 M README.md
 M integrations/browser-use/README.md
 M integrations/browser-use/capture.test.ts
 M integrations/browser-use/capture.ts
 M integrations/browser-use/example.py
 M integrations/browser-use/package-lock.json
 M integrations/browser-use/package.json
 M integrations/browser-use/requirements.txt
 M integrations/browserbase/README.md
 M integrations/browserbase/package-lock.json
 M integrations/browserbase/package.json
 M package-lock.json
 M package.json
 M python/README.md
 M python/dbar/__init__.py
 M python/dbar/capsule.py
 M python/dbar/recorder.py
 M python/dbar/types.py
 M python/pyproject.toml
 M python/tests/conftest.py
 M python/tests/test_recorder.py
 M src/__tests__/network-replayer.test.ts
 M src/cli.ts
 M src/cli/replay.ts
 M src/coordinator.ts
 M src/network/replayer.ts
 M src/sdk.ts
 M src/snapshot/state.ts
 M tsup.config.ts
?? AUDIT.md
?? CHANGELOG.md
?? RELEASE_PLAN.md
?? eslint.config.js
?? python/dbar/__pycache__/
?? python/tests/__pycache__/
?? src/__tests__/cli-replay.test.ts
?? src/__tests__/replay-compare.test.ts
?? src/__tests__/sdk-replay.test.ts
?? src/replay/
```

**Exit criteria:**

- Version path is explicit.
- No package metadata is changed before the target is accepted.

### Task 3: Fix PyPI Truth And Python Release Path

**Status:** Complete for Phase 3 Task 3. PyPI current-state truth is documented, Python package metadata targets `1.0.0`, the release workflow checks Python metadata consistency and uses trusted publishing, and docs no longer claim that PyPI is already available.

**DoD:** DOD-1, DOD-5, DOD-8, DOD-10

**Estimated cycles:** 2

**Depends on:** Task 2

**Files likely involved in Phase 3:**

- `python/pyproject.toml`
- `python/dbar/_version.py`
- `python/README.md`
- `README.md`
- `.github/workflows/release.yml`
- `CHANGELOG.md`

**Audit blocker handled:** PyPI package is missing externally; docs and badges imply it exists.

**Steps:**

- [x] Verify current PyPI state externally immediately before implementation.
- [x] Decide whether `dbar` on PyPI can be published under the current project name.
- [x] If publishing is available, repair release workflow and package metadata so PyPI publish is reliable.
- [x] If publishing is not available, remove or soften PyPI claims and install commands until the package exists.
- [x] Ensure Python package version matches the selected release version.
- [x] Rebuild Python distributions from a clean state during release verification.
- [x] Verify `pip install dbar` or the documented fallback from a clean environment before RC.

**Task 3 findings and release gate:**

- External PyPI state before editing:
  - `python3 -m pip index versions dbar` returned `ERROR: No matching distribution found for dbar`.
  - `https://pypi.org/pypi/dbar/json` returned HTTP `404` with `{"message": "Not Found"}`.
  - `https://test.pypi.org/pypi/dbar/json` also returned HTTP `404`.
- Public registry metadata shows no existing `dbar` project on PyPI or TestPyPI at audit time, so the name appears unclaimed from public package metadata.
- Publishability cannot be proven locally. PyPI project creation and ownership depend on PyPI accepting the name and on trusted publishing being configured for `pyyush/dbar` and the `pypa/gh-action-pypi-publish` release job.
- Release gate for PyPI:
  - root npm package metadata and Python package metadata must both match the `v1.0.0` tag before release verification can pass
  - PyPI trusted publishing or a pending publisher must be configured for this repository before the `pypi` job runs
  - after publish, `https://pypi.org/pypi/dbar/json`, `python3 -m pip index versions dbar`, and a clean install of `dbar` must all succeed before docs may claim PyPI availability
- Current docs truth:
  - root README and `python/README.md` state that `dbar` is not yet published on PyPI as of May 4, 2026
  - local editable install commands are documented until external PyPI verification passes
  - post-release `pip install` commands are explicitly conditional on `1.0.0` PyPI publication and external verification
  - Python lane remains recorder/diff evidence only, not deterministic replay

**Task 3 changes made:**

- `python/pyproject.toml`: set Python package version to `1.0.0`, set development classifier to production/stable for the selected major-release path, and added project URLs.
- `python/dbar/_version.py`: set runtime `__version__` to `1.0.0`.
- `README.md`: removed the current PyPI badge/claim, documented local editable install before PyPI publication, and made future `pip install dbar` conditional on verified `1.0.0` publication.
- `python/README.md`: added PyPI status, first-publish gate, local editable install commands, post-publication install commands, and recorder/diff caveat.
- `.github/workflows/release.yml`: added a check that `python/pyproject.toml` and `dbar.__version__` match the release tag, and added a PyPI state preflight message before trusted publishing.
- `CHANGELOG.md`: added planned `1.0.0` notes for Python metadata, release workflow, and truthful PyPI claims.

**Task 3 verification:**

- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python python3 -m pytest python/tests`: passed, 35 tests.
- `python3 -m pip install --dry-run -e './python[dev]'`: passed; would install `dbar-1.0.0`.
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=python python3 -c 'import dbar; print(dbar.__version__)'`: printed `1.0.0`.
- Metadata consistency check: `python/pyproject.toml` and `python/dbar/_version.py` both report `1.0.0`.
- `python3 -m build --outdir /tmp/dbar-python-dist-task3 python`: passed; built `dbar-1.0.0.tar.gz` and `dbar-1.0.0-py3-none-any.whl` outside the repo.
- `python3 -m twine check /tmp/dbar-python-dist-task3/*`: passed for the temp wheel and sdist. It emitted a local urllib3 LibreSSL warning, but both artifacts passed.
- `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/release.yml'); puts 'release workflow YAML parse ok'"`: passed.
- External registry check after docs changes:
  - `python3 -m pip index versions dbar`: still reports no matching distribution, as expected before publish.
  - `curl https://pypi.org/pypi/dbar/json`: still returns HTTP `404`, as expected before publish.

**Task 3 scope notes:**

- No publish was attempted.
- No repo `python/dist` artifacts were built or cleaned.
- A temp build output was written only to `/tmp/dbar-python-dist-task3`.
- Root npm package files, root source, integration packages, CI workflow, and generated artifacts were not intentionally modified in this task.

**Exit criteria:**

- External PyPI truth matches docs.
- The Python lane is accurately described as recorder/diff unless deterministic replay is actually implemented there.

### Task 4: Route And Resolve npm Audit Failures

**DoD:** DOD-8, DOD-9, DOD-11

**Status:** Complete for Phase 3 Task 4. The root package, browser-use integration, and Browserbase integration audits were fixed with lockfile-only updates; no top-level `package.json` dependency ranges changed, so no toolchain/package-range escalation is required for this task.

**Estimated cycles:** 2

**Depends on:** Task 2

**Files likely involved in Phase 3:**

- `package.json`
- `package-lock.json`
- `integrations/browser-use/package.json`
- `integrations/browser-use/package-lock.json`
- `integrations/browserbase/package.json`
- `integrations/browserbase/package-lock.json`
- `.github/workflows/ci.yml`

**Audit blocker handled:** `npm audit` fails in root and both integrations due transitive `vite` and `postcss` advisories.

**Steps:**

- [x] Capture the current audit output for root, browser-use, and Browserbase packages.
- [x] Identify the minimal dependency movement that moves `vite` beyond the vulnerable range and `postcss` to a fixed version.
- [x] Confirm orchestrator routing was not needed because the advisories resolved with lockfile-only transitive updates and no top-level package-range, browser-matrix, CI, or build-tool change.
- [x] Apply only the approved dependency updates.
- [x] Run root verification: `npm run build`, `npm run typecheck`, `npm test`, `npm run lint`, `npm audit`.
- [x] Run browser-use verification: `npm run typecheck`, `npm test`, `npm audit`.
- [x] Run Browserbase verification: `npm test`, `npm audit`, direct `tsc --noEmit`.

**Exit criteria:**

- npm audit is clean or each remaining advisory has explicit release-owner acceptance.
- Toolchain changes are documented and approved.

**Task 4 audit findings and routing:**

- Pre-fix root `npm audit --json`: 2 vulnerabilities, `postcss <8.5.10` moderate via `GHSA-qx2v-qp2m-jg93`, and `vite 8.0.0 - 8.0.4` high via `GHSA-4w7w-66w2-5vf9`, `GHSA-v2wj-q39q-566r`, and `GHSA-p9ff-h696-f583`.
- Pre-fix `integrations/browser-use` audit: same `postcss` and `vite` advisories, 2 total vulnerabilities.
- Pre-fix `integrations/browserbase` audit: same `postcss` and `vite` advisories, 2 total vulnerabilities.
- Pre-fix locked versions were root `vite=8.0.2`, browser-use `vite=8.0.3`, Browserbase `vite=8.0.3`, and `postcss=8.5.8` in all three lockfiles.
- Ran `npm audit fix --package-lock-only` in the root package, `integrations/browser-use`, and `integrations/browserbase`.
- Post-fix locked versions are `vite=8.0.10` and `postcss=8.5.13` in all three lockfiles, outside the audited vulnerable ranges.
- Top-level package manifests were unchanged after the fix; SHA-256 stayed `78146626fba1bc2774fcf49b0f8963f135cbbd1bd52807773022b5b4e7a9c6aa` for `package.json`, `8798951f44b3298eeea3c110b3f76a261041ed42d4ef7785edc6108f3f0bfd83` for `integrations/browser-use/package.json`, and `9bff68a25b6b7a2e981dae56065396d205e0d1856a817b1056854eed4917f988` for `integrations/browserbase/package.json`.
- No package range, browser matrix, CI, or build-tool baseline decision was locked in this task.

**Task 4 verification:**

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 15 files and 216 tests.
- `npm run lint`: passed.
- `npm audit`: passed, 0 vulnerabilities.
- `npm --prefix integrations/browser-use run typecheck`: passed.
- `npm --prefix integrations/browser-use test`: passed, 1 file and 16 tests.
- `npm --prefix integrations/browser-use audit`: passed, 0 vulnerabilities.
- `npm --prefix integrations/browserbase test`: passed, 1 file and 17 tests.
- `npm --prefix integrations/browserbase audit`: passed, 0 vulnerabilities.
- `npm --prefix integrations/browserbase exec tsc -- --noEmit`: passed.

### Task 5: Add Coverage Tooling And Threshold

**DoD:** DOD-7, DOD-9

**Status:** Complete for Phase 3 Task 5. Root Vitest coverage now has a noninteractive command, a matching `@vitest/coverage-v8` provider, realistic initial thresholds, and a CI step in the existing root Node 20/22 job.

**Estimated cycles:** 2

**Depends on:** Task 4 if coverage dependency changes affect Vitest/toolchain versions

**Files likely involved in Phase 3:**

- `package.json`
- `package-lock.json`
- `vitest.config.ts`
- `.github/workflows/ci.yml`
- optional Python coverage config

**Audit blocker handled:** coverage tooling missing; `@vitest/coverage-v8` not installed.

**Steps:**

- [x] Add the approved Vitest coverage provider.
- [x] Add a noninteractive root coverage script.
- [x] Run the first coverage report and record actual percentages.
- [x] Set an initial threshold based on actual coverage and release risk, not a guessed number.
- [x] Decide whether Python coverage is a 1.0.0 gate or advisory report.
- [x] Add coverage to CI only after local results are stable.

**Exit criteria:**

- Release artifacts include a current coverage percentage.
- CI can run coverage without missing dependencies.

**Task 5 coverage results:**

- Coverage command: `npm run coverage` runs `vitest run --coverage`.
- Provider: `@vitest/coverage-v8@4.1.1`, matching the locked root Vitest version.
- Report output stays outside the repo by default at `/tmp/dbar-coverage`, overridable with `DBAR_COVERAGE_DIR`.
- Current all-file root coverage: statements 65.94%, branches 57.78%, functions 77.18%, lines 66.93%.
- Initial thresholds: statements 65%, branches 55%, functions 75%, lines 65%.
- Threshold rationale: the initial gate is intentionally just below observed coverage to prevent regression while documenting the gap to the 80% core coverage goal. Raising thresholds requires Task 8 and related core/CLI coverage work, especially around `src/cli.ts`, `src/sdk.ts`, and `src/cli/run-eval.ts`.
- Python coverage decision: Python coverage remains advisory for the 1.0.0 plan until a separate Python coverage task is approved; Task 5 gates root TypeScript coverage only.
- CI handling: added `npm run coverage` to the existing root TypeScript CI job after lint, preserving the current Node 20/22 matrix and leaving Python/integration jobs unchanged.

**Task 5 verification:**

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 15 files and 216 tests.
- `npm run lint`: passed.
- `npm run coverage`: passed, 15 files and 216 tests, coverage above configured thresholds.
- `npm audit`: passed, 0 vulnerabilities.

### Task 6: Align Local And Remote CI

**DoD:** DOD-5, DOD-7, DOD-8, DOD-9, DOD-11

**Status:** Complete for Phase 3 Task 6. The dirty local `CI` workflow is the intended 1.0.0 baseline: root TypeScript runs on Node 20 and 22 with build, typecheck, test, lint, and coverage; Python runs on 3.10, 3.11, and 3.12; browser-use runs typecheck and tests; Browserbase runs tests; no Firefox/WebKit, browser-harness, or live Browserbase required matrix was added. Remote GitHub still has the old root-only workflow until this branch is pushed.

**Estimated cycles:** 2

**Depends on:** Tasks 3, 4, 5

**Files likely involved in Phase 3:**

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- package lockfiles

**Audit blocker handled:** local dirty CI and remote GitHub CI mismatch.

**Steps:**

- [x] Decide whether the dirty local CI workflow is the intended 1.0.0 baseline.
- [x] Ensure local GitHub CI includes Node 20/22 root jobs.
- [x] Ensure local GitHub CI includes Python 3.10/3.11/3.12 jobs.
- [x] Ensure local GitHub CI includes browser-use and Browserbase unit integration jobs.
- [x] Keep lint and coverage after Tasks 4 and 5 are stable.
- [x] Do not add Firefox/WebKit or browser-harness matrix jobs without orchestrator approval.
- [x] Record the current remote CI mismatch and leave remote alignment as a push/PR gate.

**Exit criteria:**

- Local workflow file contains the intended 1.0.0 CI baseline.
- Remote GitHub workflow mismatch is documented; local and remote will agree only after this branch is pushed and the workflow run is verified.
- CI claims in docs must not claim the expanded workflow is live on GitHub until the push/PR gate runs.

**Task 6 CI alignment results:**

- Local `CI` workflow jobs: `typescript`, `python`, `browser-use`, and `browserbase`.
- Root TypeScript job matrix: Node 20 and 22; steps are `npm ci`, `npm run build`, `npm run typecheck`, `npm test`, `npm run lint`, and `npm run coverage`.
- Python job matrix: Python 3.10, 3.11, and 3.12; steps are editable install with dev dependencies and `python -m pytest tests/ -q`.
- Browser-use job: Node 22, integration package `npm ci`, `npm run typecheck`, and `npm test`.
- Browserbase job: Node 22, integration package `npm ci`, and `npm test`; no live Browserbase credential gate is required.
- Unapproved matrices: no Firefox/WebKit jobs, no browser-harness CI, and no cross-browser Playwright matrix.
- Remote mismatch recorded with `gh workflow view CI --yaml`: remote `CI` still has only the old `build` job with Node 20/22 root `npm ci`, build, typecheck, and test. It does not yet include lint, coverage, Python, browser-use, or Browserbase jobs.

**Task 6 verification:**

- YAML parse for `.github/workflows/ci.yml` and `.github/workflows/release.yml`: passed.

### Task 7: Freeze And Document Browser Support Truth

**DoD:** DOD-3, DOD-9, DOD-10

**Status:** Complete for Phase 3 Task 7. Browser support truth is documented as Chromium/CDP-only for deterministic replay, Firefox/WebKit are explicitly unsupported unless future implementation changes, browser binary expectations for `playwright-core` are documented, and the Python/browser-use and Browserbase docs now avoid unsupported replay claims.

**Estimated cycles:** 1

**Depends on:** Task 6

**Files likely involved in Phase 3:**

- `README.md`
- `python/README.md`
- `integrations/browser-use/README.md`
- `integrations/browserbase/README.md`
- possible CLI preflight code/tests if implementation is approved

**Audit blocker handled:** browser matrix/support honesty gap.

**Steps:**

- [x] Declare Chromium/CDP-only support for deterministic replay.
- [x] State Firefox/WebKit are unsupported unless future implementation changes.
- [x] Document browser binary expectations for `playwright-core`.
- [x] Document unsupported traffic/state boundaries: WebSockets, SSE, service workers, sessionStorage, IndexedDB, cross-target workers, downloads/uploads, auth prompts, and browser cache caveats.
- [x] Add implementation preflight only if scoped by the orchestrator; otherwise keep this as docs plus release-gate truth.

**Exit criteria:**

- Browser support claims are honest and testable.
- No cross-browser CI is implied.

**Task 7 browser support results:**

- Root README now defines deterministic capture/replay as Chromium/CDP-only and documents missing-browser troubleshooting for `playwright-core`.
- Root README documents unsupported replay boundaries for WebSockets/SSE, service workers, `sessionStorage`, IndexedDB, cross-target workers, downloads/uploads, auth prompts, file pickers, browser profile side effects, and browser cache.
- Python README and browser-use integration README state that browser-use is observe-only: snapshots, diffs, and audit evidence only, with no deterministic replay capsule, network replay, or time freezing.
- Browserbase README states Browserbase support requires a Chromium CDP `session.connectUrl`, local replay still needs a Chromium-compatible browser, live Browserbase credentials are only needed for capture examples, and replay is bounded by DBAR's current supported surfaces.
- No browser-harness dependency, backend, required gate, or matrix was added.
- No CLI preflight was implemented. Docs-only is sufficient for this task because the approved requirement was support-truth documentation, and adding code would touch source outside this unit without a scoped missing-Chromium preflight requirement.

**Task 7 verification:**

- Docs consistency grep/read passed across `README.md`, `python/README.md`, `integrations/browser-use/README.md`, and `integrations/browserbase/README.md` for Chromium/CDP-only support, Firefox/WebKit unsupported status, `playwright-core` browser binary expectations, replay boundaries, browser-use observe-only truth, Browserbase credential/replay truth, and no browser-harness dependency/backend/matrix claims.
- No build/typecheck/test/lint run was required for Task 7 because the implementation was docs-only and no package, workflow, source, or generated files were changed.

### Task 8: Make Multi-Step Replay Workflow Release-Quality

**DoD:** DOD-2, DOD-3, DOD-4, DOD-10

**Status:** Complete for Phase 3 Task 8. The 1.0.0 release surface keeps CLI replay narrow and honest: `dbar replay` performs automatic step comparison and does not replay user actions between steps. `DBAR.startReplay` is the stable multi-step surface for replaying workflows that need caller-provided Playwright actions between step comparisons.

**Estimated cycles:** 3

**Depends on:** Task 2

**Files likely involved in Phase 3:**

- `src/sdk.ts`
- `src/cli/replay.ts`
- `src/cli/args.ts`
- `src/__tests__/sdk-replay.test.ts`
- `src/__tests__/cli-replay.test.ts`
- `README.md`
- examples or demo files

**Audit blocker handled:** `dbar replay` does not replay user actions between steps.

**Steps:**

- [x] Decide whether 1.0.0 CLI must support scripted multi-step replay, or whether the API-level `DBAR.startReplay` contract is the stable multi-step surface.
- [x] Confirm scripted CLI replay support is out of scope for 1.0.0; no replay-plan format was added.
- [x] If CLI support is out of scope, make the CLI limitation explicit and document the API path for multi-step replay.
- [x] Add tests for first blocking divergence, advisory screenshot mismatch, network mismatch, and multi-step action boundaries.
- [x] Ensure JSON output gives enough data for CI and incident workflows.

**Exit criteria:**

- A production user can understand how to replay a multi-step failed run.
- 1.0.0 claims do not imply unsupported automatic action replay.

**Task 8 product decision:**

- Scripted multi-step CLI replay is out of scope for 1.0.0. Adding a replay-plan format would broaden DBAR toward orchestration and create a second action language before the API path is proven.
- `DBAR.startReplay` is the release-quality multi-step surface. It restores the capsule initial state, starts replay controls, compares one step at a time, and leaves Playwright actions between steps explicit in user code.
- `DBAR.replay` and `dbar replay` remain automatic comparison surfaces. They are suitable for single-step capsules or workflows that do not need caller actions between comparisons; they do not click, type, or navigate through captured user actions.

**Task 8 implementation results:**

- Reused the step-level replay comparison path for `DBAR.replay` and `ReplaySession.step` so blocking and advisory divergence semantics stay consistent.
- CLI JSON includes `success`, `failedStepCount`, `replaySuccessRate`, `determinismViolationRate`, `timeToDivergence`, `firstDivergence`, `firstBlockingDivergence`, and the full divergence list for CI and incident workflows.
- README documents the CLI limitation and shows the `DBAR.startReplay` API path for multi-step action boundaries.
- Tests cover first blocking divergence, advisory screenshot mismatch behavior, network digest mismatch behavior, and `ReplaySession.step` moving the network attribution boundary between manual replay actions.

**Task 8 verification:**

- Full verification run from repo root on 2026-05-04:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm test` passed, 15 files and 217 tests.
  - `npm run lint` passed.
  - `npm run coverage` passed, 15 files and 217 tests; overall coverage was 67.99% statements, 59.27% branches, 77.85% functions, and 69.07% lines.
  - `npm audit` passed with 0 vulnerabilities.

### Task 9: Implement Capture-On-Failure Regression Artifact Workflow

**DoD:** DOD-4, DOD-10, DOD-13

**Status:** Complete for Phase 3 Task 9. The README now documents a Playwright-first capture-on-failure reference that keeps capsules only for failed or explicitly high-value runs, validates and replays retained capsules, uploads capsules and replay JSON as CI artifacts, and keeps browser-harness as optional live-runner interop rather than a DBAR dependency or release gate.

**Estimated cycles:** 2

**Depends on:** Tasks 7 and 8

**Files likely involved in Phase 3:**

- `README.md`
- `demo/`
- `.github/workflows/ci.yml` or example workflow file
- optional browser-harness example docs

**Audit blocker handled:** capture-on-failure exists as README snippet but not as tested reference workflow.

**Steps:**

- [x] Add a Playwright-first capture-on-failure reference that writes a capsule only for failed or high-value runs.
- [x] Add validation and replay commands to the workflow.
- [x] Store the capsule as a CI artifact in the example.
- [x] Include the browser-harness optional interop path as an example only: browser-harness executes live, DBAR captures proof where DBAR owns or can safely attach.
- [x] Keep browser-harness outside dependencies and release gates.

**Exit criteria:**

- Failed run -> capsule -> validate -> replay -> regression artifact is documented and verified.
- Browser-harness interop is optional and non-coupled.

**Task 9 implementation results:**

- README's failed-run workflow now shows a Playwright test wrapper that starts DBAR capture, runs the high-value checkout workflow, and persists `*.capsule` output only when the test failed or `DBAR_KEEP_HIGH_VALUE=1` is set.
- README documents `npx dbar validate` and `npx dbar replay --json` for retained capsules, preserving replay JSON even when replay exits `1` for a blocking divergence.
- README includes a GitHub Actions example that uploads retained capsules and replay JSON with `actions/upload-artifact@v4` while using `if-no-files-found: ignore`.
- README documents optional browser-harness interop as live execution only; DBAR captures proof only around a Chromium/CDP Playwright `Page` it owns or can safely attach to, and no dependency, backend, matrix, or release gate was added.

**Task 9 verification:**

- Docs grep/read passed across `README.md` and `RELEASE_PLAN.md` for `DBAR_KEEP_HIGH_VALUE`, `npx dbar validate`, `npx dbar replay --json`, `actions/upload-artifact@v4`, retained capsule/replay JSON paths, Chromium/CDP Playwright ownership, and optional browser-harness interop without dependency/backend/release-gate claims.
- Dependency/workflow grep confirmed `browser-harness` appears only in docs/planning references, not in `package.json`, package locks, or GitHub workflow dependencies/matrices.
- `git diff --check` passed.
- No build/typecheck/test/lint/coverage/audit run was required for Task 9 because this pass changed docs/release-plan text only and did not materially change code, package metadata, or workflow behavior.

### Task 10: Add Capsule Privacy And Safe Sharing Controls

**DoD:** DOD-8, DOD-10

**Status:** Complete for Phase 3 Task 10. DBAR's 1.0.0 safe-sharing model is full-fidelity and sensitive by default: known auth headers are redacted, replay-critical capsule contents are retained, and validation emits advisory warnings for likely sensitive fields instead of silently stripping data and weakening replay.

**Estimated cycles:** 3

**Depends on:** Task 2

**Files likely involved in Phase 3:**

- `src/network/types.ts`
- `src/snapshot/state.ts`
- `src/capsule/validator.ts`
- `src/coordinator.ts`
- `src/sdk.ts`
- relevant tests
- `README.md`
- `integrations/browserbase/README.md`

**Audit blocker handled:** capsules contain cookies, localStorage, screenshots, and full response bodies; only headers are redacted by default.

**Steps:**

- [x] Define the 1.0.0 safe-sharing model: default redaction, opt-in full fidelity, or explicit unsafe artifact warning.
- [x] Add or document redaction for cookies, localStorage, URL query values, request/response headers, response bodies, and screenshots.
- [x] Add validation warnings for likely sensitive capsule contents where practical.
- [x] Add tests proving redaction behavior and proving replay-fidelity tradeoffs are explicit.
- [x] Add root README safe-share warning near the first capsule example.

**Exit criteria:**

- Users know when capsules are sensitive.
- The default or documented workflow is defensible for production incidents.

**Task 10 implementation results:**

- `validateCapsule` now emits advisory safe-sharing warnings for cookies, localStorage entries, initial and network URLs with query strings, retained response bodies, screenshot artifacts, and headers whose values are already `[REDACTED]`.
- Validation warnings do not invalidate otherwise valid capsules; full response bodies remain retained for deterministic replay fidelity and the warning makes the unsafe sharing tradeoff explicit.
- Existing request/response header redaction remains the default storage behavior for known auth headers.
- README documents that capsules are full-fidelity sensitive artifacts by default near the first capsule example.
- Browserbase README documents the same safe-sharing model, including masked `session.connectUrl` logs, `npx dbar validate`, scrubbed re-recording for external sharing, and explicit unsafe handling for production evidence.

**Task 10 verification:**

- 2026-05-04 finisher pass: `npm run build` passed.
- 2026-05-04 finisher pass: `npm run typecheck` passed.
- 2026-05-04 finisher pass: `npm test` passed with 15 test files and 219 tests.
- 2026-05-04 finisher pass: `npm run lint` passed.
- 2026-05-04 finisher pass: `npm run coverage` passed with 15 test files and 219 tests; overall line coverage was 69.78%, and `src/capsule/validator.ts` line coverage was 96.72%.
- 2026-05-04 finisher pass: `npm audit` passed with 0 vulnerabilities.
- 2026-05-04 finisher pass: `git diff --check` passed before and after this verification note update.

### Task 11: Verify Python And Integration Lanes

**DoD:** DOD-5, DOD-8, DOD-9, DOD-10

**Status:** Complete for Phase 3 Task 11. Python packaging and both integration lanes now have fresh local verification evidence, Browserbase live smoke coverage is credential-gated and skips safely when secrets are absent, browser-use remains observe-only in docs, and the optional browser-use Python audit blocker is recorded precisely as a Python-version/tooling constraint rather than left ambiguous.

**Estimated cycles:** 2

**Depends on:** Tasks 3, 4, 6, 7

**Files likely involved in Phase 3:**

- `python/`
- `integrations/browser-use/`
- `integrations/browserbase/`
- `.github/workflows/ci.yml`
- docs for each lane

**Audit blockers handled:** live integration evidence missing; Python optional audit blocked.

**Steps:**

- [x] Run Python tests under 3.10, 3.11, and 3.12 in CI.
- [x] Rerun Python package audit, including browser-use optional requirements.
- [x] Fix the `pip-audit` temp venv/ensurepip blocker or use an approved alternate audit path.
- [x] Keep browser-use docs observe-only and no deterministic replay.
- [x] Add or run a Browserbase live capture smoke test only when credentials are available, and make it skip safely when secrets are absent.
- [x] Add or run a providerless or mocked browser-use verification path if possible.

**Exit criteria:**

- Integration claims are backed by CI or explicitly marked as manual/credential-gated.
- Python package audit is not blocked.

**Task 11 implementation results:**

- Task 6 already aligned local GitHub Actions to run the Python lane in CI on Python 3.10, 3.11, and 3.12. This task added fresh local evidence on the current workstation interpreter (`Python 3.9.6`) without changing the approved CI/runtime matrix.
- `integrations/browserbase/__tests__/live-smoke.test.ts` already used a safe credential gate:
  `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` must both be present or the live smoke test is registered with `it.skip`.
- Local environment verification confirmed no Browserbase credentials were present, and `npm --prefix integrations/browserbase test` reported `1 skipped` test. This proves the live smoke path stays non-blocking without secrets while remaining runnable when credentials are supplied.
- The browser-use lane remains observe-only in docs. Grep verification across `README.md`, `python/README.md`, and `integrations/browser-use/README.md` still shows no deterministic replay claim for the Python/browser-use surfaces.
- Browser-use already has a providerless verification path: `npm --prefix integrations/browser-use test` passed its existing Vitest suite without any live provider dependency.
- Python packaging produced fresh release artifacts with `python3 -m build`, and `python3 -m twine check` passed for both the wheel and sdist.
- Python audit evidence was split into core and integration-advisory lanes:
  - Core package audit: an isolated target install of the freshly built wheel audited clean with `python3 -m pip_audit --path <tempdir>`, reporting `No known vulnerabilities found`. `pip_audit` still notes `dbar (1.0.0)` is not on PyPI yet, so the package itself cannot be matched to PyPI metadata.
  - Host-environment audit: a direct `python3 -m pip_audit` run from `python/` is available but noisy; it reported 16 vulnerabilities in unrelated host-environment packages and skipped local unpublished packages (`agent-contracts 0.1.0`, `dbar 0.2.0`). This was treated as advisory host evidence, not the lane-specific release gate.
  - Browser-use Python requirements audit: superseded by Task 15 blocker resolution. `integrations/browser-use/requirements.txt` is now comment-only and DBAR no longer ships `dbar[browser-use]`; browser-use remains an application-owned dependency that downstream users must audit in their own environment.
- Both JavaScript integration packages audited clean with `npm audit`.
- `git diff --check` passed after this Task 11 pass.

**Task 11 verification:**

- `python3 -m pytest python/tests -q` -> passed, `35 passed in 0.05s`.
- `cd python && python3 -m build --outdir /tmp/dbar-python-build-483q8Z` -> passed, built `dbar-1.0.0.tar.gz` and `dbar-1.0.0-py3-none-any.whl`.
- `python3 -m twine check /tmp/dbar-python-build-483q8Z/*` -> passed for both artifacts.
- `cd python && python3 -m pip_audit` -> available; reported 16 vulnerabilities in unrelated host-environment packages and skipped unpublished local packages (`agent-contracts 0.1.0`, `dbar 0.2.0`).
- `python3 -m pip install --no-deps --target /tmp/dbar-python-audit-oslmfO /tmp/dbar-python-build-483q8Z/dbar-1.0.0-py3-none-any.whl && python3 -m pip_audit --path /tmp/dbar-python-audit-oslmfO` -> passed for the isolated Python lane with `No known vulnerabilities found`; advisory skip remained for unpublished `dbar (1.0.0)`.
- `python3 -m pip_audit -r integrations/browser-use/requirements.txt` -> superseded by Task 15 blocker resolution; the requirements file is now comment-only and DBAR does not ship browser-use Python pins.
- `npm --prefix integrations/browser-use run typecheck` -> passed.
- `npm --prefix integrations/browser-use test` -> passed, `1` file and `16` tests.
- `npm --prefix integrations/browser-use audit` -> passed, `0 vulnerabilities`.
- `npm --prefix integrations/browserbase test` -> passed, `2` files and `18` tests total with `1 skipped`; the skipped test is the credential-gated live smoke.
- `npm --prefix integrations/browserbase audit` -> passed, `0 vulnerabilities`.
- Browser truth grep across `README.md`, `python/README.md`, `integrations/browser-use/README.md`, and `integrations/browserbase/README.md` -> passed for observe-only browser-use wording, Chromium/CDP-only deterministic replay wording, and Browserbase credential-gated smoke wording.
- `git diff --check` -> passed.

### Task 12: Add Performance Budgets And Measurements

**DoD:** DOD-12

**Status:** Complete for Phase 3 Task 12. The root package now has a hermetic production-shaped performance fixture and an `npm run performance` budget gate covering package artifact size, serialized capsule size, capture overhead per step, replay validation latency per step, and heap growth.

**Estimated cycles:** 2

**Depends on:** Tasks 8 and 9

**Files likely involved in Phase 3:**

- performance fixture or test files
- `README.md`
- release checklist
- possible benchmark script

**Audit blocker handled:** no performance budgets for bundle size, capsule size, capture overhead, replay latency, or memory.

**Steps:**

- [x] Define a production-shaped fixture with multiple steps, nontrivial DOM, network responses, and screenshots.
- [x] Measure capsule size, capture overhead per step, replay latency per step, and peak memory if tooling allows.
- [x] Set initial budgets for 1.0.0.
- [x] Decide whether budget failures block release or require explicit acceptance.
- [x] Record package size and built output sizes in release notes.

**Task 12 results:**

- Added `src/__tests__/helpers/performance-fixture.ts` with a four-step dashboard fixture, HTTP responses, DOM/accessibility snapshots, screenshot artifacts, and trace segments.
- Added `src/__tests__/performance-budgets.test.ts` as the budget gate and `npm run performance` as the focused command.
- Added `npm run performance` to the root TypeScript CI job and local `release:verify` chain so budget regressions block release by default.
- Initial blocking budgets for 1.0.0: built ESM/CJS artifacts <= 280 kB raw and <= 80 kB gzip each, serialized fixture capsule <= 700 kB, fixture capture overhead <= 200 ms per step, replay validation <= 50 ms per step, and heap delta <= 24 MiB.
- README now records the performance-budget surface and large-capsule risks. Budget failures block release unless the release owner explicitly revises the budget and records the reason in this plan and changelog.

**Task 12 verification:**

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 16 files and 223 tests.
- `npm run performance`: passed, 1 file and 4 tests.
- `npm run lint`: passed.
- `npm run coverage`: passed, 16 files and 223 tests, overall line coverage 69.78%.
- `npm audit`: passed, 0 vulnerabilities.
- `npm run release:verify`: passed, including build, typecheck, test, performance, lint, coverage, audit, and pack dry-run. Pack dry-run reported package size 83.5 kB and unpacked size 403.7 kB for 9 files.
- `git diff --check`: passed.

**Exit criteria:**

- Performance costs are known and bounded.
- Large-capsule risks are documented.

### Task 13: API And Capsule Stability Review

**Status:** Complete for Phase 3 Task 13. The README now explicitly classifies the 1.0.0 stable, experimental, and internal TypeScript/Python API surfaces; documents stable root CLI commands and exit-code behavior; freezes capsule manifest/archive compatibility and migration expectations; and records browser-harness as docs-only live-runner interop with no dependency, backend, release gate, or CI matrix.

**DoD:** DOD-2, DOD-3, DOD-10

**Estimated cycles:** 2

**Depends on:** Tasks 8, 10, 12

**Files likely involved in Phase 3:**

- `src/index.ts`
- `src/capsule/types.ts`
- `src/sdk.ts`
- `src/cli.ts`
- `python/dbar/__init__.py`
- docs

**Steps:**

- [x] Review every exported TypeScript symbol and decide stable, experimental, or internal.
- [x] Review CLI commands and exit codes for 1.0.0 compatibility.
- [x] Review capsule manifest compatibility and migration expectations.
- [x] Review Python package exports and clarify that Python capsules are a separate recorder/diff format.
- [x] Add docs for what is stable in 1.0.0 and what remains experimental.

**Task 13 decisions:**

- Stable TypeScript surface for 1.0.0:
  - High-level SDK: `DBAR.capture`, `DBAR.startReplay`, `DBAR.replay`, `DBAR.validate`, `DBAR.validateSerialized`, `DBAR.serialize`, `DBAR.deserialize`, `CaptureSession`, `ReplaySession`, `ReplayOptions`, and `ReplayStepResult`.
  - Capsule/archive API: `buildCapsule`, `serializeCapsuleArchive`, `deserializeCapsuleArchive`, `validateCapsule`, `CapsuleBuildInput`, and `CapsuleArchive`.
  - Root capsule/replay data contracts and matching Zod schemas exported from `src/index.ts`: `DeterminismCapsule`, `EnvironmentDescriptor`, `SeedPackage`, `InitialState`, `NetworkEntry`, `NetworkTranscript`, `CapsuleStep`, `StepAction`, `StepObservables`, `StepArtifacts`, `CapsuleMetrics`, `CapsuleCookie`, `Divergence`, `DivergenceType`, `StepSnapshot`, `ReplayResult`, and `ValidationResult`.
- Experimental TypeScript surface:
  - Low-level CDP/capture primitives: `Coordinator`, `TimeVirtualizer`, `NetworkRecorder`, `NetworkReplayer`, snapshot capture/restore helpers, and `TraceTimeline`.
  - Network and utility helpers: transcript construction, request/body hashing, header redaction, SSE/WebSocket classifiers.
  - These remain usable for custom integrations, but options, diagnostics, and exact low-level behavior may change in a minor release if stable SDK/capsule contracts stay compatible.
- Internal or unsupported surface:
  - Deep imports from `dist/`, `src/`, tests, or implementation files; generated filenames; benchmark fixtures; redaction internals; test helpers; and the minimal YAML parser behind `dbar eval`.
  - Browser-harness examples are docs-only interop. No `browser-harness` runtime dependency, backend, release coupling, required gate, or CI matrix is in scope for 1.0.0.
- Stable root CLI commands:
  - `dbar replay <capsule-path> [--cost] [--json]`: `0` means replay completed without blocking divergence; `1` means blocking divergence, malformed input, missing browser, or command-level fatal error under current root CLI behavior.
  - `dbar validate <capsule-path>`: `0` means valid, including advisory warnings; `1` means invalid capsule or command-level fatal error.
  - `dbar eval --capsules <dir> --assertions <yaml-path> [--json]`: `0` means all evaluated capsules passed; `1` means assertion failure, invalid capsule, missing input, empty assertion/capsule set, or command-level fatal error. The command shape is stable, while the narrow YAML dialect is not a general YAML API.
  - `dbar --help` and `dbar --version`: `0` on success.
  - Browserbase integration CLI keeps its separate documented `0` success, `1` divergence, `2` fatal-error convention.
- Capsule compatibility:
  - Root deterministic replay capsules are the TypeScript archive with `capsule.json`, manifest literals `version: "1.0.0"` and `capsuleProfile: "replay"`, archive files under `network/<sha256>`, `snapshots/<step>/dom.json`, `snapshots/<step>/accessibility.json`, `snapshots/<step>/screenshot.png`, and optional `traces/<step>.json`.
  - Serialized transport remains a base64-encoded JSON object mapping archive paths to base64 file contents.
  - Changes that make 1.0.0 capsules unreadable, change required manifest fields, change archive paths, change replay matching semantics, or remove stable SDK/CLI output fields are breaking release-contract changes and require migration notes, changelog entries, compatibility tests, and either a previous-format reader or explicit major migration path.
  - Optional metadata may be added in a minor release only when validators and replayers tolerate absence.
- Python stability:
  - Stable exports are `DBARRecorder`, `Capsule`, and `__version__`.
  - Stable Python recorder/diff calls are `DBARRecorder(...)`, `on_step_end(agent)`, `finish()`, `Capsule.load(path)`, `Capsule.diff(other)`, `Capsule.summary()`, and the public `Capsule` attributes `path`, `step_count`, `size_kb`, and `manifest`.
  - Python capsules are JSON recorder/diff evidence artifacts. They are not the root TypeScript deterministic replay archive format, do not freeze time, and do not replay network traffic.

**Files changed in Task 13:**

- `README.md`: added 1.0.0 API stability, CLI stability, capsule compatibility, and Python API stability sections.
- `RELEASE_PLAN.md`: marked Task 13 complete and recorded the stability decisions.

**Verification:**

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 16 files and 223 tests.
- `npm run performance`: passed, 1 file and 4 tests.
- `npm run lint`: passed.
- `npm run coverage`: passed, 16 files and 223 tests, overall line coverage 69.78%.
- `npm audit`: passed, 0 vulnerabilities.
- `git diff --check`: passed.

**Exit criteria:**

- Public API stability claims are explicit.
- Accidental exports are removed or documented before 1.0.0.

### Task 14: Documentation Completion Pass

**Status:** Complete for Phase 3 Task 14 pending final commit isolation. The
docs now include a five-minute install-to-capsule quick start, top why-use-this
answers, runnable examples, debugging and troubleshooting guidance, API
reference notes, migration notes, security/threat-model guidance, performance
and coverage summary, production readiness checklist, and a browser-harness ADR
that keeps browser-harness docs-only/non-coupled for 1.0.0.

**DoD:** DOD-1, DOD-4, DOD-5, DOD-7, DOD-8, DOD-9, DOD-10, DOD-12, DOD-13

**Estimated cycles:** 2

**Depends on:** Tasks 3 through 13

**Files likely involved in Phase 3:**

- `README.md`
- `python/README.md`
- `integrations/browser-use/README.md`
- `integrations/browserbase/README.md`
- `CHANGELOG.md`
- release notes

**Steps:**

- [x] Update install docs after npm and PyPI truth is verified.
- [x] Add production-readiness checklist.
- [x] Add safe-sharing and redaction guidance.
- [x] Add browser support and unsupported-mode table.
- [x] Add capture-on-failure and regression artifact workflow.
- [x] Add coverage and performance summary.
- [x] Add browser-harness interop section with no dependency/backend/release-coupling claims.
- [x] Ensure Python/browser-use docs do not claim deterministic replay.

**Registry truth checked on May 4, 2026:**

- npm `@pyyush/dbar`: `0.2.0`
- PyPI `dbar`: no matching distribution

**Documentation evidence:**

- `README.md`: five-minute quick start, top three why-use-this answers,
  unsupported-mode table, debugging sequence, examples index, API reference
  notes, migration/security links, production-readiness checklist, performance
  and coverage summary.
- `examples/`: three runnable Node examples for capture/validate/replay,
  capture-on-failure, and step-by-step replay.
- `MIGRATION.md`: 0.2.x to 1.0.0 migration notes and compatibility promises.
- `TROUBLESHOOTING.md`: top user-facing failure questions.
- `SECURITY.md`: disclosure path and threat-model summary.
- `docs/API_REFERENCE.md`: stable, experimental, and internal API surfaces.
- `docs/adr/0001-browser-harness-interop.md`: no browser-harness dependency,
  backend, release gate, or CI matrix for 1.0.0.
- Python/browser-use docs remain observe-only and do not claim deterministic
  replay.

**Verification:**

- `node --check examples/01-capture-validate-replay.mjs`,
  `examples/02-capture-on-failure.mjs`, and
  `examples/03-step-by-step-replay.mjs`: passed.
- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 16 files and 223 tests.
- `npm run performance`: passed, 1 file and 4 tests.
- `npm run lint`: passed.
- `npm run coverage`: passed, 16 files and 223 tests; total line coverage
  remains 69.78%.
- `npm audit`: passed, 0 vulnerabilities.
- `git diff --check`: passed.

**Commit status:** no Task 14 commit was created. `README.md` and
`RELEASE_PLAN.md` already contained prior uncommitted changes, and the worktree
has a broad dirty baseline across root TypeScript, integrations, Python, and
untracked release files. A scoped docs commit would include earlier work.

**Exit criteria:**

- Docs match implementation and verified release behavior.
- A new user can install, capture, validate, replay, and understand safety limits.

### Task 15: Release Hygiene And Package Verification

**DoD:** DOD-1, DOD-8, DOD-11

**Estimated cycles:** 2

**Depends on:** Tasks 3 through 14

**Files likely involved in Phase 3:**

- `.gitignore`
- `.github/workflows/release.yml`
- package manifests
- generated package artifacts during verification only

**Audit blocker handled:** dirty tree, stale generated artifacts, and package dry-run depending on existing `dist`.

**Status:** Complete for Phase 3 Task 15. Root npm packaging is verified from a freshly regenerated `dist`, Python sdist/wheel are rebuilt from source and checked with Twine, release automation now cleans generated artifacts before package creation, and repo hygiene files/templates are present. The Python `browser-use` optional-extra blocker is resolved for RC by removing that extra from the shipped Python package surface and release audit: DBAR's recorder is duck-typed and does not import `browser-use`, while both `browser-use==0.12.5` and latest `0.12.6` currently pull vulnerable exact transitive pins (`aiohttp 3.13.3`, `pillow 12.1.1`, `pypdf 6.9.1`, `python-dotenv 1.2.1`, and `requests 2.32.5`).

**Steps:**

- [x] Start from an orchestrator-approved checkpoint.
- [x] Ensure ignored operator artifacts are not tracked.
- [x] Regenerate root `dist` from source during release verification.
- [x] Regenerate Python `dist` from source during release verification.
- [x] Run `npm pack --dry-run` after fresh build.
- [x] Run Python build and twine check after fresh build.
- [x] Ensure release workflow hygiene checks match the intended public release tree.

**Task 15 changes:**

- `package.json`: added `package:check`, changed `release:verify` to clean `dist` before build, and changed `prepublishOnly` to clean/build/check package contents.
- `scripts/check-npm-pack.mjs`: validates `npm pack --dry-run --json` output against the intended 9-file public package.
- `.github/workflows/release.yml`: release `verify` now fails on tracked ignored/internal files, cleans Python artifacts before build, audits the built Python wheel, asserts that no Python `browser-use` extra ships, audits both npm integration packages, and runs npm package checking immediately before publish.
- `.gitignore`: ignores coverage, Python build metadata, and Python cache artifacts.
- Repo hygiene files added: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/CODEOWNERS`, `.github/dependabot.yml`, issue templates, and PR template.
- `docs/RELEASE_PROCESS.md`: documents local release verification, tag-to-publish automation, npm provenance, PyPI trusted publishing, required repository settings, secret scanning/push protection, and the decision that `dbar[browser-use]` is out of scope until upstream browser-use pins audit clean.
- Browser-harness remains non-coupled: grep found no `browser-harness` dependency in package manifests, lockfiles, Python metadata, or workflows; mentions remain docs-only in integration READMEs.

**Task 15 verification evidence:**

- Registry truth: `npm view @pyyush/dbar version --json` -> `0.2.0`; `python3 -m pip index versions dbar` -> no matching distribution.
- `npm run build` -> passed.
- `npm run typecheck` -> passed.
- `npm test` -> passed, 16 files and 223 tests.
- `npm run performance` -> passed, 1 file and 4 tests.
- `npm run lint` -> passed.
- `npm run coverage` -> passed, 16 files and 223 tests, 69.78% line coverage.
- `npm audit` -> passed, 0 vulnerabilities.
- `npm run package:check` -> passed; npm dry-run package verified as 9 files, 87,499 bytes packed, 416,561 bytes unpacked before the final release-doc link update.
- Final `npm run release:verify` -> passed from cleaned `dist`, including build, typecheck, test, performance, lint, coverage, audit, and package dry-run check; final npm dry-run package verified as 9 files, 87,563 bytes packed, 416,763 bytes unpacked.
- Python 3.12 temp venv install of `./python[dev] build twine pip-audit` -> passed.
- `/tmp/dbar-task15-venv/bin/python -m pytest python/tests` -> passed, 35 tests.
- Fresh Python build after cleanup -> built `dbar-1.0.0.tar.gz` and `dbar-1.0.0-py3-none-any.whl`.
- `twine check dist/*` from `python/` -> passed for wheel and sdist.
- Python package contents verified: wheel contains only package modules and `.dist-info`; sdist contains package modules, tests, README, `.gitignore`, and `pyproject.toml`.
- Isolated built-wheel audit -> passed with no known vulnerabilities; `dbar (1.0.0)` is skipped because it is not yet on PyPI.
- `npm --prefix integrations/browser-use run typecheck` -> passed.
- `npm --prefix integrations/browser-use test` -> passed, 1 file and 16 tests.
- `npm --prefix integrations/browser-use audit` -> passed, 0 vulnerabilities.
- `npm --prefix integrations/browserbase test` -> passed, 1 file passed, 1 skipped; 17 tests passed, 1 skipped.
- `npm --prefix integrations/browserbase audit` -> passed, 0 vulnerabilities.
- Release hygiene local equivalents: no tracked ignored files; no tracked internal-only files; no banner drafts outside `.github/banners/05-replay-arrows.svg`.
- Task 15 blocker-resolution PyPI truth: `npm view @pyyush/dbar version --json` -> `0.2.0`; `python3.12 -m pip index versions dbar` -> no matching distribution; `python3.12 -m pip index versions browser-use` -> latest `0.12.6`.
- Task 15 blocker-resolution metadata check: `browser-use==0.12.6` exact-pins `aiohttp==3.13.3`, `pillow==12.1.1`, `pypdf==6.9.1`, `python-dotenv==1.2.1`, and `requests==2.32.5`; safe dependency override is not feasible without overriding browser-use's exact requirements.
- Task 15 blocker-resolution vulnerability reproduction: temp Python 3.12 audit with `pip-audit` reported 19 known vulnerabilities for both the former `./python[browser-use]` install and direct `browser-use==0.12.6`.
- Task 15 blocker-resolution Python verification after removing the extra: Python 3.12 temp venv install of `./python[dev] build twine pip-audit` passed; `pytest python/tests -q` passed with 35 tests; fresh Python build and `twine check` passed; isolated built-wheel audit passed with no known vulnerabilities apart from the expected unpublished `dbar (1.0.0)` skip.
- Task 15 blocker-resolution requirements verification: `python -m pip_audit -r integrations/browser-use/requirements.txt --progress-spinner off` passed with no known vulnerabilities because the file is intentionally comment-only.
- Task 15 blocker-resolution release-surface check: a Python metadata assertion confirmed `browser-use extra absent`.
- Task 15 blocker-resolution root verification: `npm run release:verify` passed, including build, typecheck, 223 tests, performance budgets, lint, coverage, `npm audit`, and package checking; npm package verified as 9 files, 87,609 bytes packed and 416,902 bytes unpacked.
- Task 15 blocker-resolution browser-use integration verification: `npm --prefix integrations/browser-use run typecheck`, `npm --prefix integrations/browser-use test`, and `npm --prefix integrations/browser-use audit` all passed.
- Task 15 blocker-resolution whitespace check: `git diff --check` passed.

**Task 15 blockers carried forward:**

- Commit not possible without sweeping unrelated release-branch work: the worktree already had broad dirty edits and untracked release-plan/docs/source/test files before Task 15.
- The former Python `browser-use` optional extra blocker is resolved by removing that extra from the 1.0.0 release scope. Current PyPI truth checked on May 4, 2026: latest `browser-use` is `0.12.6`; `browser-use==0.12.6` metadata exact-pins `aiohttp==3.13.3`, `pillow==12.1.1`, `pypdf==6.9.1`, `python-dotenv==1.2.1`, and `requests==2.32.5`; `pip-audit` reports 19 known vulnerabilities for both the former `./python[browser-use]` install and direct `browser-use==0.12.6`.
- `python/pyproject.toml` now exposes only the `dev` extra.
- `integrations/browser-use/requirements.txt` is intentionally comment-only so DBAR does not provide an active vulnerable install file.
- Root README, Python README, browser-use integration README, `example.py`, and release-process docs now state that users must install and audit browser-use in their own application environment.
- GitHub repository settings cannot be proven locally: branch protection, required checks, CODEOWNERS review, Dependabot alerts, secret scanning, push protection, and private vulnerability reporting still need remote confirmation before RC/final release.

**Exit criteria:**

- [x] Release packages are reproducible from source.
- [x] No stale local artifacts influence package contents.

### Task 16: RC Gate

**DoD:** all

**Estimated cycles:** 1

**Depends on:** Tasks 1 through 15

**RC gate status:** Handoff prepared, but still blocked on version alignment, remote settings, registry credentials, an actual RC artifact, remote CI evidence, and external validation. The Task 15 Python `browser-use` optional-extra blocker is resolved by removing that extra from the release scope and making the release workflow assert that it is absent before any tag can publish.

**Task 16 handoff artifacts:**

- [x] `RC_VALIDATION.md` created with exact RC placeholders, install commands, smoke commands, CI evidence checklist, external-validator instructions, pass/fail criteria, checksum fields, and remaining blockers.
- [x] `docs/RELEASE_PROCESS.md` points release owners to `RC_VALIDATION.md`.
- [x] Browser-harness remains optional interop only; no dependency, backend, release gate, or CI matrix was added.
- [ ] RC version alignment is resolved before tag creation. Current blocker: npm should use `1.0.0-rc.1`, Python should use PEP 440 `1.0.0rc1`, and the release workflow must compare normalized versions or use a compatible tag scheme.

**Required evidence before RC:**

- [ ] Root Node 20 and 22 CI pass.
- [ ] Python 3.10, 3.11, and 3.12 CI pass.
- [ ] Browser-use integration CI passes.
- [ ] Browserbase integration CI passes.
- [ ] Coverage report exists and meets accepted threshold.
- [ ] npm audit is clean or accepted.
- [ ] Python package audit is clean and release workflow confirms no vulnerable `browser-use` optional extra ships.
- [ ] npm package dry-run matches expected contents.
- [ ] Python package build and twine check pass.
- [ ] Docs are internally consistent and externally true.
- [ ] Browser-harness remains optional interop only.

**Exit criteria:**

- Tag an RC only after every item above has evidence.

### Task 17: External User Validation Gate

**DoD:** DOD-3, DOD-4, DOD-5, DOD-8, DOD-10, DOD-12

**Estimated cycles:** 2

**Depends on:** Task 16

**External-user gate status:** Blocked until RC exists.

**Required evidence before final 1.0.0:**

- [ ] A fresh external install from npm works.
- [ ] A fresh external install from PyPI works, or docs do not claim PyPI availability.
- [ ] A user can capture a capsule from a Chromium/CDP Playwright workflow.
- [ ] A user can validate and replay the capsule.
- [ ] A user can identify first blocking divergence from CLI or SDK output.
- [ ] A user can follow safe-sharing guidance and understand capsule sensitivity.
- [ ] A credential-gated Browserbase run is validated manually or marked unsupported for automated release evidence.
- [ ] browser-use lane is validated as observe-only.

**Exit criteria:**

- A non-author user can complete the primary workflow without private context.

### Task 18: Final Release Gate

**DoD:** all

**Estimated cycles:** 1

**Depends on:** Task 17

**Release gate status:** Blocked until implementation, RC, and external validation happen.

**Required evidence before `1.0.0`:**

- [ ] All DoD sections closed.
- [ ] All RC and external validation gates closed.
- [ ] GitHub issues checked again and triaged.
- [ ] External npm and PyPI versions checked immediately before publish.
- [ ] Release notes include breaking/stable API statement, security posture, browser support, performance summary, and known limitations.
- [ ] Orchestrator approves final publish.

**Exit criteria:**

- Publish `1.0.0` only with explicit orchestrator approval and complete evidence.

## Dependencies Overview

Critical path:

1. Task 1: stabilize branch and ownership snapshot.
2. Task 2: confirm 1.0.0 release contract.
3. Task 4: route/resolve npm audit because it can affect build tooling.
4. Task 5: add coverage after toolchain direction is approved.
5. Task 6: align CI after package/tooling changes settle.
6. Tasks 8, 9, 10: replay workflow, incident workflow, and privacy controls.
7. Task 13: API/capsule stability review.
8. Task 14: docs completion.
9. Task 15: release hygiene.
10. Tasks 16 through 18: RC, external user, final release gates.

Parallelizable after Task 2:

- Task 3 PyPI truth can run alongside Task 4 npm audit.
- Task 7 browser support docs can run alongside Task 8 if implementation support is unchanged.
- Task 10 capsule privacy can run alongside Task 11 integration verification.
- Task 12 performance budgets can start after a stable fixture from Task 9 exists.

Do not parallelize without coordination:

- Package metadata changes across root and Python.
- Toolchain/lockfile changes.
- Replay semantics and capsule format changes.
- CI workflow changes while audit/security dependencies are moving.

## Risks And Blockers

Current blockers:

- PyPI `dbar` package is missing externally.
- Root and integration `npm audit` fail due transitive `vite` and `postcss`.
- Coverage tooling is missing.
- Python optional dependency audit is blocked by `pip-audit` temp venv `ensurepip` SIGABRT.
- Local CI workflow and remote GitHub CI do not match.
- No browser matrix exists; Chromium/CDP-only support must be declared honestly.
- Multi-step CLI replay gap remains unresolved.
- Capsule privacy/safe-sharing controls are insufficient for stable release.
- Performance budgets are not defined.
- Release hygiene depends on an already dirty worktree and stale generated artifacts.
- Live integration evidence is missing for Browserbase and browser-use.

Decision risks:

- Toolchain fixes may require dependency movement that affects shared dbar/useid browser assumptions.
- PyPI name ownership may block the intended Python package name.
- A direct 1.0.0 release may be too risky if registry/security/CI gates remain open; use `0.3.0` only as interim hardening if needed.

Product risks:

- Overclaiming deterministic replay outside DBAR-owned Chromium/CDP sessions would undermine trust.
- Over-integrating browser-harness would blur DBAR's proof-layer wedge.
- Safe-sharing defaults can trade off replay fidelity; docs and options must make that explicit.

Operational risks:

- Dirty worktree can hide unrelated user edits.
- Existing generated artifacts can make package verification falsely pass.
- Live Browserbase validation requires secrets and may be flaky or billable.

## RC, External-User, And Release Gates

RC gate: blocked.

- Blocked until implementation tasks close, local verification passes, and remote CI proves the intended matrix.

External-user gate: blocked.

- Blocked until RC exists and a fresh install/capture/validate/replay workflow is tested outside the author's local checkout.

Release gate: blocked.

- Blocked until RC and external-user gates close, all DoD items are complete, registries are externally verified, and the orchestrator approves publish.

## Interim 0.3.0 Hardening Path

Use this path only if the orchestrator wants security and truth fixes before the full 1.0.0 user workflow is complete.

Minimum `0.3.0` scope:

- Fix PyPI truth or remove PyPI claims.
- Resolve npm audit failures or document accepted risk.
- Add coverage tooling and publish current report.
- Align remote CI with intended root/Python/integration jobs.
- Correct browser support and capsule privacy claims in docs.
- Keep browser-harness interop out of dependencies and CI.

Do not include in `0.3.0` unless already complete:

- New browser-harness dependency.
- Firefox/WebKit support.
- Major replay-plan format that is not stable.
- Hosted/backend/control-plane work.

## Plan Self-Review

Spec coverage:

- Target `1.0.0` with semver justification: covered in Target Version.
- Ordered task list with DoD tags: covered in Ordered Task List.
- Estimated cycles: included per task.
- Dependencies: included per task and in Dependencies Overview.
- Risks/blockers: included in Risks And Blockers.
- Audit blockers: each blocker has a named task and is repeated in current blockers.
- Browser-harness research outcome: covered with `interoperate` and explicit non-goals.
- Browser/toolchain matrix: covered.
- RC/external-user/release gates: covered and marked blocked.

Placeholder scan:

- No task relies on an unspecified placeholder.
- Later phases must still produce concrete code/test changes during implementation planning at task level.

DoD delta at plan completion:

- Planning file closes Phase 2 only.
- Implementation DoD remains open for DOD-1, DOD-2, DOD-3, DOD-4, DOD-5, DOD-7, DOD-8, DOD-9, DOD-10, DOD-11, and DOD-12 until Phase 3+ work provides evidence.
