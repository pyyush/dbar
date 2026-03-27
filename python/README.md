# DBAR Python SDK

Deterministic Browser Agent Runtime — record replayable browser execution capsules from [browser-use](https://github.com/browser-use/browser-use) agents.

## Install

```bash
pip install dbar
```

For browser-use integration:

```bash
pip install dbar[browser-use]
```

## Usage

Three lines to add deterministic recording to any browser-use agent:

```python
from dbar import DBARRecorder

recorder = DBARRecorder(output_dir="./capsules")

# Pass recorder.on_step_end as the browser-use hook
agent = Agent(task="...", on_step_end=recorder.on_step_end)
await agent.run()

capsule = recorder.finish()
print(capsule.summary())
```

## Capsule Diff

Compare two recorded sessions step by step:

```python
from dbar import Capsule

a = Capsule.load("./capsules/run1/capsule.json")
b = Capsule.load("./capsules/run2/capsule.json")

divergences = a.diff(b)
for d in divergences:
    print(f"Step {d['step']}: {d['field']} diverged")
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output_dir` | `str` | `"./dbar_output"` | Directory for capsule output |
| `include_screenshots` | `bool` | `True` | Record screenshot hashes |
| `include_dom` | `bool` | `True` | Record DOM snapshot hashes |
| `include_actions` | `bool` | `True` | Record browser actions |
| `include_thinking` | `bool` | `False` | Record model reasoning |
| `redact_sensitive` | `bool` | `False` | Redact URLs query params and sensitive content |

## License

Apache-2.0
