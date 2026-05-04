# DBAR 1.0.0 RC Validation Handoff

This handoff prepares the RC gate only. It does not tag, publish, or certify a
release.

## RC Artifact Placeholders

Use these exact placeholders for the first candidate unless the release owner
chooses a later RC number.

| Field | Placeholder |
|---|---|
| GitHub tag | `v1.0.0-rc.1` |
| GitHub release | `DBAR 1.0.0 RC 1` |
| npm package | `@pyyush/dbar@1.0.0-rc.1` |
| npm tarball | `pyyush-dbar-1.0.0-rc.1.tgz` |
| PyPI package | `dbar==1.0.0rc1` |
| Python sdist | `dbar-1.0.0rc1.tar.gz` |
| Python wheel | `dbar-1.0.0rc1-py3-none-any.whl` |

Important versioning blocker: npm prereleases use SemVer
`1.0.0-rc.1`, while Python prereleases should use PEP 440 `1.0.0rc1`.
Before tagging an RC, the release workflow must either normalize the Python
version comparison or the release owner must use a tag/version scheme that is
accepted by npm, Python packaging, and the workflow checks.

## Pre-RC Local Gate

Run these commands from `/Users/piyush/GitHub/browser/dbar` before creating any
RC tag or package.

```bash
git status --short
git branch --show-current
git log -1 --oneline

npm view @pyyush/dbar version --json
python3 -m pip index versions dbar

npm ci
npm run release:verify
```

Run the Python package lane in a fresh environment.

```bash
python3.12 -m venv /tmp/dbar-rc-py312
source /tmp/dbar-rc-py312/bin/activate
python -m pip install -U pip build twine pip-audit
python -m pip install -e "./python[dev]"
python -m pytest python/tests -q

rm -rf python/dist python/build
find python -maxdepth 1 -name "*.egg-info" -exec rm -rf {} +
cd python
python -m build
python -m twine check dist/*
rm -rf /tmp/dbar-python-audit
python -m pip install --no-deps --target /tmp/dbar-python-audit dist/*.whl
python -m pip_audit --path /tmp/dbar-python-audit --progress-spinner off
cd ..
deactivate
```

Confirm the release still does not ship the vulnerable `browser-use` optional
extra.

```bash
python3 - <<'PY'
import pathlib
import tomllib

metadata = tomllib.loads(pathlib.Path("python/pyproject.toml").read_text(encoding="utf-8"))
extras = metadata.get("project", {}).get("optional-dependencies", {})
if "browser-use" in extras:
    raise SystemExit("dbar[browser-use] must not ship in the 1.0.0 RC")
print("browser-use extra absent")
PY
```

Run integration gates.

```bash
npm --prefix integrations/browser-use ci
npm --prefix integrations/browser-use run typecheck
npm --prefix integrations/browser-use test
npm --prefix integrations/browser-use audit
python3 -m pip_audit -r integrations/browser-use/requirements.txt --progress-spinner off

npm --prefix integrations/browserbase ci
npm --prefix integrations/browserbase test
npm --prefix integrations/browserbase audit
```

Final local hygiene checks.

```bash
git diff --check
git status --short
```

## RC Build And Checksum Fields

After the pre-RC gate passes and the version-alignment blocker is resolved,
record each artifact and checksum before asking for validation.

| Artifact | Path or URL | SHA-256 |
|---|---|---|
| npm tarball | `pyyush-dbar-1.0.0-rc.1.tgz` | `<sha256>` |
| Python sdist | `python/dist/dbar-1.0.0rc1.tar.gz` | `<sha256>` |
| Python wheel | `python/dist/dbar-1.0.0rc1-py3-none-any.whl` | `<sha256>` |
| GitHub release | `<github-release-url>` | n/a |
| CI run | `<github-actions-run-url>` | n/a |

Suggested checksum commands:

```bash
shasum -a 256 pyyush-dbar-1.0.0-rc.1.tgz
shasum -a 256 python/dist/dbar-1.0.0rc1.tar.gz
shasum -a 256 python/dist/dbar-1.0.0rc1-py3-none-any.whl
```

## Install Commands For Validators

Use registry installs after the prerelease is published.

```bash
npm install @pyyush/dbar@1.0.0-rc.1 playwright
npx playwright install chromium
```

```bash
python3 -m pip install --pre dbar==1.0.0rc1
```

Use local artifact installs only if the release owner shares tarballs directly.

```bash
npm install ./pyyush-dbar-1.0.0-rc.1.tgz playwright
npx playwright install chromium
```

```bash
python3 -m pip install ./dbar-1.0.0rc1-py3-none-any.whl
```

## Smoke Commands For External Validators

Run the npm smoke in a clean temporary project on Node.js 20 or 22.

```bash
mkdir dbar-rc-smoke
cd dbar-rc-smoke
npm init -y
npm install @pyyush/dbar@1.0.0-rc.1 playwright
npx playwright install chromium
curl -fsSLO https://raw.githubusercontent.com/pyyush/dbar/v1.0.0-rc.1/examples/01-capture-validate-replay.mjs
node 01-capture-validate-replay.mjs
npx dbar validate ./artifacts/example-homepage.capsule
```

Optional multi-step replay smoke:

```bash
curl -fsSLO https://raw.githubusercontent.com/pyyush/dbar/v1.0.0-rc.1/examples/03-step-by-step-replay.mjs
node 03-step-by-step-replay.mjs
```

Run the Python smoke in a fresh virtual environment.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install --pre dbar==1.0.0rc1
python - <<'PY'
from dbar import Capsule, DBARRecorder, __version__

print(__version__)
recorder = DBARRecorder(output_dir="./capsules", include_screenshots=False, include_dom=False)
capsule = recorder.finish()
loaded = Capsule.load(capsule.path)
print(loaded.summary())
PY
```

Browser-use validation is optional for the RC and must happen in the
validator's own audited application environment. DBAR does not install
`browser-use` and does not ship `dbar[browser-use]`.

## CI Evidence Checklist

Attach links or artifacts for each item before promoting RC feedback to final
release readiness.

- [ ] GitHub Actions RC run URL: `<url>`
- [ ] Root Node 20 CI passed
- [ ] Root Node 22 CI passed
- [ ] Python 3.10 CI passed
- [ ] Python 3.11 CI passed
- [ ] Python 3.12 CI passed
- [ ] Browser-use integration CI passed
- [ ] Browserbase integration CI passed
- [ ] Coverage report attached and accepted
- [ ] npm audit clean or accepted with rationale
- [ ] Python package audit clean
- [ ] Release workflow confirms no `browser-use` optional extra ships
- [ ] npm dry-run package contents match `scripts/check-npm-pack.mjs`
- [ ] Python build and `twine check` passed
- [ ] Browser-harness remains optional interop only
- [ ] Docs install commands match the published RC artifacts

## External Validator Instructions

Ask at least one external developer to run the npm smoke in their own clean
project and, if they use Python evidence capsules, the Python smoke as well.
Collect:

- OS, CPU architecture, Node.js version, Python version, browser channel
- install command used
- whether the capsule was created and validated
- whether replay succeeded and the reported `replaySuccessRate`
- any warnings from `DBAR.validate`
- whether the README quick start was enough to complete the smoke
- failure logs or artifacts for any failed command

## Pass/Fail Criteria

The RC passes only if all of these are true:

- Local pre-RC gate passes from a clean worktree.
- Remote CI passes for the declared Node, Python, browser-use, and Browserbase
  lanes.
- npm and Python artifacts install in a clean environment.
- The npm smoke creates, validates, and replays a capsule.
- At least one external developer validates the RC in their own project.
- P0 issues found during RC are fixed before final release.
- Documentation remains true for npm, PyPI, browser support, browser-use, and
  Browserbase.

The RC fails if any of these happen:

- Package versions do not align with the RC tag and registry artifacts.
- A high or critical unaccepted vulnerability ships in the release package.
- The npm smoke cannot create or replay a capsule in a clean environment.
- The Python package cannot install or import from a clean environment.
- The external validator cannot complete the README path without undocumented
  local checkout assumptions.
- Browser-harness becomes a dependency, backend, release gate, or CI matrix
  entry without explicit approval.

## Remaining Blockers

- No RC tag, GitHub release, npm prerelease, PyPI prerelease, or checksums exist
  yet.
- `package.json` is still `0.2.0` while Python package metadata is `1.0.0`;
  an RC version-alignment pass is required before tagging.
- npm SemVer prerelease and Python PEP 440 prerelease normalization must be
  handled before the release workflow can verify a single RC tag.
- PyPI project ownership/trusted publishing for `dbar` still needs release-owner
  confirmation.
- npm provenance credentials still need release-owner confirmation.
- GitHub branch protection, required checks, CODEOWNERS review, Dependabot
  alerts, secret scanning, push protection, and private vulnerability reporting
  still need remote confirmation.
- At least one external developer must validate the RC before final `1.0.0`.
