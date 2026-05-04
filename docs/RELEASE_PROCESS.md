# Release Process

This document describes the safe tag-to-publish path for DBAR. Do not publish
or tag from a dirty branch.

## Preconditions

- All Definition of Done items in `RELEASE_PLAN.md` are checked.
- The RC has been validated by at least one external developer.
- `package.json`, `python/pyproject.toml`, and `python/dbar.__version__` match
  the intended tag version.
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
rm -rf python/dist python/build python/*.egg-info
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

## Tag-To-Publish Automation

Pushing a `v*` tag starts `.github/workflows/release.yml`.

1. `verify` checks repository hygiene, version alignment, root package gates,
   Python package build and `twine check`, browser-use integration checks, and
   Browserbase integration checks. It also runs npm and Python package audits.
2. `npm` publishes `@pyyush/dbar` with npm provenance after `verify` passes. It
   requires `NPM_TOKEN` and `id-token: write`.
3. `pypi` publishes the Python package using PyPI trusted publishing after npm
   succeeds. It does not use a long-lived PyPI token. The first `dbar` publish
   depends on PyPI accepting the project name and the repository publisher
   being configured in PyPI.

Do not create the final tag until the release owner confirms the registry
credentials, PyPI trusted publisher, branch protection, and external RC
validation evidence.

## Repository Settings

The GitHub repository should have:

- branch protection on `main`
- required pull request review from CODEOWNERS
- required CI checks for TypeScript, Python, browser-use, and Browserbase
- no force pushes or branch deletions on `main`
- Dependabot version updates and security alerts enabled
- secret scanning and push protection enabled
- private vulnerability reporting enabled

These settings are not fully provable from the local checkout. Treat them as
release blockers until confirmed in GitHub.
