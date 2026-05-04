# Release Process

This document describes the safe tag-to-publish path for DBAR. Do not publish
or tag from a dirty branch.

## Preconditions

- All Definition of Done items in `RELEASE_PLAN.md` are checked.
- The RC has been validated by at least one external developer.
- `RC_VALIDATION.md` is filled in with the RC artifact URLs, checksums, CI run,
  external validator results, and any accepted residual risks.
- Checked-in `package.json`, `package-lock.json`, `python/pyproject.toml`,
  and `python/dbar/_version.py` target the final stable version `1.0.0`.
  Release-candidate tags are normalized by `scripts/prepare-release-version.mjs`
  inside the release workflow before any package is built or published.
- `npm view @pyyush/dbar version --json` and
  `python3 -m pip index versions dbar` have been checked immediately before
  release.
- Browser-harness remains optional interop only. It is not a dependency,
  backend, release gate, or CI matrix entry.

## Local Release Verification

From the repo root:

```bash
npm ci
npm run release:verify
python3 -m pip install -e "./python[dev]" build twine
python3 -m pytest python/tests
rm -rf python/dist python/build
find python -maxdepth 1 -name "*.egg-info" -exec rm -rf {} +
cd python
python3 -m build
python3 -m twine check dist/*
```

`npm run release:verify` removes `dist`, rebuilds from source, runs the full
root gates, audits dependencies, and verifies the npm dry-run package contents.
The npm package must contain only the root package metadata, README, LICENSE,
and built `dist/` entry points.

Python builds must remove `python/dist`, `python/build`, and `python/*.egg-info`
before rebuilding. `twine check` must pass on the freshly generated sdist and
wheel.

The release workflow also audits:

- the freshly built Python wheel in an isolated target directory
- the browser-use and Browserbase npm integration packages
- that the Python package does not ship a `browser-use` optional extra

DBAR 1.0.0 does not ship `dbar[browser-use]`. As of May 4, 2026, PyPI's latest
`browser-use` is `0.12.6`, and both `0.12.5` and `0.12.6` exact-pin vulnerable
transitive dependencies. The browser-use lane remains integration guidance and
an npm sidecar test lane only until upstream publishes an auditable dependency
set or DBAR adds a separate safe adapter package.

For release candidates, use `RC_VALIDATION.md` as the operating checklist. The
checked-in release branch keeps package metadata at stable `1.0.0`; do not hand
edit the branch to an RC version. For a tag `v1.0.0-rc.N`, the release workflow
runs `scripts/prepare-release-version.mjs` and rewrites only the CI checkout to
publish `@pyyush/dbar@1.0.0-rc.N` with npm dist-tag `next` and
`dbar==1.0.0rcN` to PyPI. For a final tag `v1.0.0`, the same script verifies
`@pyyush/dbar@1.0.0`, `dbar==1.0.0`, npm dist-tag `latest`, and a non-prerelease
GitHub release.

## Tag-To-Publish Automation

Pushing a `v*` tag starts `.github/workflows/release.yml`.

1. `verify` checks repository hygiene, version alignment, root package gates,
   Python package build and `twine check`, browser-use integration checks, and
   Browserbase integration checks. It also runs npm and Python package audits.
   For RC tags, version alignment means npm SemVer and Python PEP 440 are
   compared after workflow normalization, not by raw tag-string equality.
2. `npm` publishes `@pyyush/dbar` with npm provenance after `verify` passes. It
   requires `NPM_TOKEN` and `id-token: write`. RC publishes use npm dist-tag
   `next`; final publishes use `latest`.
3. `pypi` publishes the Python package using PyPI trusted publishing after npm
   succeeds. It does not use a long-lived PyPI token. The first `dbar` publish
   depends on PyPI accepting the project name and the repository publisher
   being configured in PyPI.

Do not create the final tag until the release owner confirms PyPI trusted
publishing/project ownership and external RC validation evidence. Orchestrator
evidence on May 4, 2026 confirmed the GitHub repository settings below and
local npm identity as `pyyush`; the tag workflow still has to prove the publish
path during the RC.

## Repository Settings

The GitHub repository should have, and orchestrator evidence says it now has:

- branch protection on `main`
- 1 required review, CODEOWNERS review, stale review dismissal, and conversation
  resolution
- required status contexts: `typescript (20)`, `typescript (22)`,
  `python (3.10)`, `python (3.11)`, `python (3.12)`, `browser-use`, and
  `browserbase`
- linear history, no force-push/delete, and enforce-admins
- Dependabot vulnerability alerts and security updates enabled
- secret scanning and push protection enabled
- private vulnerability reporting enabled
