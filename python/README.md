# DBAR Python SDK

**Open-source evidence capsules for `browser-use` runs.**

The PyPI package records browser-use agent executions into shareable capsule files you can inspect, diff, and keep as regression artifacts.

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

It does **not** yet provide the full deterministic replay engine from the TypeScript package. If you need deterministic capture and replay with CDP-level time/network control, use the main package in the repo root.

## Version Compatibility

- `dbar 0.2.0`
- `browser-use 0.12.5`
- Python 3.11+ for the `browser-use` extra

## Install

```bash
pip install dbar
```

For browser-use integration:

```bash
pip install dbar[browser-use]
```

The `browser-use` extra is pinned to `browser-use==0.12.5` and requires
Python 3.11 or newer because that upstream package does.

If you only need capsule loading and diffing, `pip install dbar` is enough.
If you want the browser-use hook integration, install the extra.

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

Under browser-use 0.12.5, the recorder prefers the live
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
- you need CDP-level time and network control
- you want strict replay verification and divergence detection

Install that package from npm:

```bash
npm install @pyyush/dbar playwright-core
```

## Open Source

DBAR is being built as an open-source project.

The goal is simple: if a browser workflow matters, it should emit a capsule you can keep, inspect, and trust.

## License

Apache-2.0
