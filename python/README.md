# DBAR Python SDK

**Open-source evidence capsules for `browser-use` runs.**

The Python package records browser-use agent executions into shareable capsule
files you can inspect, diff, and keep as regression artifacts.

Use it when you need to answer:

- What did the agent actually do?
- What changed between two runs?
- Can I keep this failure as evidence instead of re-debugging from scratch?

## What The Python Package Does Today

The current Python SDK is a **recorder and diff tool** for `browser-use`-style workflows.

It can:

- record per-step metadata from browser-use runs
- capture page-state and screenshot hashes
- record actions and optional thinking
- redact sensitive URL query parameters
- write a capsule manifest to disk
- diff two recorded runs step by step

It does **not** provide the deterministic replay engine from the TypeScript
package. If you need deterministic capture and replay with Chromium/CDP-level
time and network control, use the main package in the repo root.

## PyPI Status

As of May 4, 2026, `dbar` is not yet published on PyPI. The local Python
package metadata targets `1.0.0`, and the `1.0.0` release workflow is the
first planned PyPI publication.

Before the release can claim PyPI availability, the release owner must verify:

- `https://pypi.org/pypi/dbar/json` resolves to the DBAR project
- `python3 -m pip index versions dbar` shows the released version
- a clean environment can install `dbar`

Until that external verification passes, install from a local checkout.

## Version Compatibility

- `dbar 1.0.0` local package metadata
- Python 3.9+ for the DBAR recorder and capsule diff package
- No `dbar[browser-use]` extra is shipped in `1.0.0`; install and audit
  `browser-use` in your application environment separately

## Install

From the repository root before PyPI publication:

```bash
python3 -m pip install -e "./python"
```

After `1.0.0` is published to PyPI and externally verified:

```bash
pip install dbar
```

Before PyPI publication, the editable install without extras is enough for
capsule loading, hook recording, and diffing. If you want to use the recorder
inside a browser-use workflow, install `browser-use` and your LLM provider in
that application's environment after running your own dependency audit. DBAR
does not currently ship a browser-use extra because the latest upstream
`browser-use` releases exact-pin vulnerable transitive dependencies.

## Quick Start

```python
from browser_use import Agent
from dbar import DBARRecorder

recorder = DBARRecorder(output_dir="./capsules")
agent = Agent(task="...")

# Pass recorder.on_step_end to agent.run(...)
await agent.run(on_step_end=recorder.on_step_end)

capsule = recorder.finish()
print(capsule.summary())
```

That writes a `capsule.json` manifest you can keep, inspect, or diff against later runs.

For browser-use-compatible agents, the recorder prefers the live
`agent.browser_session.get_browser_state_summary(...)` surface during the hook.
That gives DBAR a current page-state fingerprint and screenshot when available,
instead of relying only on the persisted history shape.

## Why Use It

- **Proof**: keep a durable record of what the agent did
- **Diffing**: compare two runs without manually inspecting every step
- **Regression artifacts**: keep failed runs around as evidence
- **Low friction**: add one recorder and one hook to an existing browser-use flow

## Compare Two Runs

```python
from dbar import Capsule

a = Capsule.load("./capsules/run1/capsule.json")
b = Capsule.load("./capsules/run2/capsule.json")

divergences = a.diff(b)
for d in divergences:
    print(f"Step {d['step']}: {d['field']} diverged")
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output_dir` | `str` | `"./dbar_output"` | Directory for capsule output |
| `include_screenshots` | `bool` | `True` | Record screenshot hashes |
| `include_dom` | `bool` | `True` | Record page-state hashes |
| `include_actions` | `bool` | `True` | Record browser actions |
| `include_thinking` | `bool` | `False` | Record model reasoning |
| `redact_sensitive` | `bool` | `False` | Redact URL query params |

## What A Capsule Contains

The Python SDK currently writes a manifest with per-step information such as:

- step index
- URL
- page-state hash
- screenshot hash
- action
- optional thinking
- timestamp

This is enough to inspect and compare runs, even though it is not yet the full replay capsule format from the TypeScript engine.

## When To Use Python vs TypeScript

Use the **Python SDK** when:

- your workflow is already built around `browser-use`
- you want quick evidence capture with minimal integration work
- you need run-to-run diffing more than deterministic replay

Use the **TypeScript package** when:

- you need deterministic replay
- you need Chromium/CDP-level time and network control
- you want strict replay verification and divergence detection

Install that package from npm:

```bash
npm install @pyyush/dbar playwright-core
```

## Browser Support Truth

The Python package and browser-use integration are observe-only. They record
browser-use step evidence and compare recorded runs, but they do not freeze
time, record/replay network responses, or create deterministic replay capsules.

Deterministic replay in DBAR is currently limited to the root TypeScript package
or Browserbase lane when DBAR owns a Chromium/CDP session. Firefox and WebKit are
unsupported for deterministic replay unless a future implementation adds
equivalent controls.

For browser-use flows, browser-use owns browser startup. Missing Chrome or
Playwright browser errors should be fixed in the browser-use/Playwright
environment before DBAR recording starts. DBAR does not add a browser-harness
dependency, backend, or CI matrix.

## Open Source

DBAR is being built as an open-source project.

The goal is simple: if a browser workflow matters, it should emit a capsule you can keep, inspect, and trust.

## License

Apache-2.0
