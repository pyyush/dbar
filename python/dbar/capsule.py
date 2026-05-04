"""Capsule loading, diffing, and summarization.

A Capsule represents a recorded browser-use session stored as JSON.
It supports step-by-step comparison of page-state and screenshot hashes
to detect run-to-run divergences.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from dbar.types import CapsuleManifest


@dataclass
class Capsule:
    """A loaded DBAR capsule with methods for comparison and inspection.

    Attributes:
        path: Absolute path to the capsule JSON file.
        step_count: Number of steps in the capsule.
        size_kb: File size in kilobytes.
        manifest: The deserialized CapsuleManifest.

    Example:
        >>> capsule = Capsule.load("./capsules/run1/capsule.json")
        >>> print(capsule.summary())
    """

    path: str
    step_count: int
    size_kb: float
    manifest: CapsuleManifest

    @classmethod
    def load(cls, path: str) -> Capsule:
        """Load a capsule from a JSON file on disk.

        Args:
            path: Path to the capsule JSON file.

        Returns:
            A Capsule instance populated from the file.

        Raises:
            FileNotFoundError: If *path* does not exist.
            ValueError: If the file contains invalid JSON.
        """
        if not os.path.exists(path):
            raise FileNotFoundError(f"Capsule file not found: {path}")

        try:
            with open(path, "r") as f:
                data = json.load(f)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"Failed to parse capsule JSON at {path}: {exc}"
            ) from exc

        manifest = CapsuleManifest.from_dict(data)
        size_kb = os.path.getsize(path) / 1024

        return cls(
            path=path,
            step_count=manifest.step_count,
            size_kb=size_kb,
            manifest=manifest,
        )

    def diff(self, other: Capsule) -> List[Dict[str, Any]]:
        """Compare this capsule against another step by step.

        Compares dom_hash and screenshot_hash for each overlapping step.
        Reports a step_count_mismatch if the capsules have different lengths.

        Args:
            other: The capsule to compare against.

        Returns:
            A list of divergence dicts, each with keys: step, field, type,
            expected, actual. Empty list if capsules are identical.
        """
        divergences: List[Dict[str, Any]] = []

        self_steps = self.manifest.steps
        other_steps = other.manifest.steps

        if self.step_count != other.step_count:
            divergences.append({
                "type": "step_count_mismatch",
                "step": -1,
                "field": "step_count",
                "expected": self.step_count,
                "actual": other.step_count,
            })

        # Compare overlapping steps on hashable fields
        comparable_fields = ["dom_hash", "screenshot_hash"]
        min_steps = min(len(self_steps), len(other_steps))
        for i in range(min_steps):
            step_a = self_steps[i]
            step_b = other_steps[i]
            for hash_field in comparable_fields:
                val_a = step_a.get(hash_field)
                val_b = step_b.get(hash_field)
                # Only compare when at least one side has a value
                if val_a is None and val_b is None:
                    continue
                if val_a != val_b:
                    divergences.append({
                        "type": "hash_mismatch",
                        "step": i,
                        "field": hash_field,
                        "expected": val_a,
                        "actual": val_b,
                    })

        return divergences

    def summary(self) -> str:
        """Return a human-readable summary of this capsule.

        Returns:
            A multi-line string with path, version, step count, and size.
        """
        lines = [
            f"DBAR Capsule v{self.manifest.version}",
            f"  Path:  {self.path}",
            f"  Steps: {self.step_count}",
            f"  Size:  {self.size_kb:.2f} KB",
        ]
        if self.manifest.created_at:
            lines.append(f"  Created: {self.manifest.created_at}")
        return "\n".join(lines)
