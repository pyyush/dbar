"""DBAR — Deterministic Browser Agent Runtime (Python SDK).

Provides recording and comparison of browser-use agent executions
via determinism capsules.

Exports:
    DBARRecorder: Records browser-use agent steps into a capsule.
    Capsule: Loads, diffs, and summarizes recorded capsules.
    __version__: Package version string.
"""

from dbar._version import __version__
from dbar.capsule import Capsule
from dbar.recorder import DBARRecorder

__all__ = ["DBARRecorder", "Capsule", "__version__"]
