"""Data types for DBAR step snapshots and capsule manifests.

Uses dataclasses with to_dict/from_dict for JSON serialization without
external dependencies. All types use ``from __future__ import annotations``
for Python 3.9 compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class StepSnapshot:
    """A single recorded step captured by the DBAR recorder.

    Attributes:
        index: Zero-based step number.
        dom_hash: SHA-256 hash of the best available page-state representation
            after this step, or None if DOM capture is disabled.
        screenshot_hash: SHA-256 hash of the screenshot after this step,
            or None if screenshots are disabled.
        action: The browser-use action taken at this step, or None.
        thinking: The model's thinking/reasoning at this step, or None.
        url: The page URL at this step, or None.
        timestamp: ISO-8601 timestamp of capture.

    Example:
        >>> snap = StepSnapshot(index=0, dom_hash="abc123", url="https://example.com")
        >>> snap.to_dict()["index"]
        0
    """

    index: int
    dom_hash: Optional[str] = None
    screenshot_hash: Optional[str] = None
    action: Optional[str] = None
    thinking: Optional[str] = None
    url: Optional[str] = None
    timestamp: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dictionary suitable for JSON encoding."""
        result: Dict[str, Any] = {"index": self.index}
        if self.dom_hash is not None:
            result["dom_hash"] = self.dom_hash
        if self.screenshot_hash is not None:
            result["screenshot_hash"] = self.screenshot_hash
        if self.action is not None:
            result["action"] = self.action
        if self.thinking is not None:
            result["thinking"] = self.thinking
        if self.url is not None:
            result["url"] = self.url
        if self.timestamp is not None:
            result["timestamp"] = self.timestamp
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> StepSnapshot:
        """Deserialize from a plain dictionary.

        Args:
            data: Dictionary with at minimum an ``index`` key.

        Returns:
            A new StepSnapshot instance.

        Raises:
            KeyError: If ``index`` is missing from *data*.
        """
        return cls(
            index=data["index"],
            dom_hash=data.get("dom_hash"),
            screenshot_hash=data.get("screenshot_hash"),
            action=data.get("action"),
            thinking=data.get("thinking"),
            url=data.get("url"),
            timestamp=data.get("timestamp"),
        )


@dataclass
class CapsuleManifest:
    """Manifest describing a DBAR capsule: its metadata and recorded steps.

    Attributes:
        version: Capsule format version (currently "0.1.0").
        step_count: Number of steps recorded.
        steps: List of per-step snapshot dictionaries.
        include_screenshots: Whether screenshots were captured.
        include_dom: Whether DOM snapshots were captured.
        include_actions: Whether actions were captured.
        include_thinking: Whether model thinking was captured.
        redact_sensitive: Whether sensitive data was redacted.
        created_at: ISO-8601 creation timestamp.

    Example:
        >>> m = CapsuleManifest(version="0.1.0", step_count=2, steps=[])
        >>> m.to_dict()["version"]
        '0.1.0'
    """

    version: str = "0.1.0"
    step_count: int = 0
    steps: List[Dict[str, Any]] = field(default_factory=list)
    include_screenshots: bool = True
    include_dom: bool = True
    include_actions: bool = True
    include_thinking: bool = False
    redact_sensitive: bool = False
    created_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dictionary suitable for JSON encoding."""
        return {
            "version": self.version,
            "step_count": self.step_count,
            "steps": self.steps,
            "include_screenshots": self.include_screenshots,
            "include_dom": self.include_dom,
            "include_actions": self.include_actions,
            "include_thinking": self.include_thinking,
            "redact_sensitive": self.redact_sensitive,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CapsuleManifest:
        """Deserialize from a plain dictionary.

        Args:
            data: Dictionary of manifest fields. All fields have defaults.

        Returns:
            A new CapsuleManifest instance.
        """
        return cls(
            version=data.get("version", "0.1.0"),
            step_count=data.get("step_count", 0),
            steps=data.get("steps", []),
            include_screenshots=data.get("include_screenshots", True),
            include_dom=data.get("include_dom", True),
            include_actions=data.get("include_actions", True),
            include_thinking=data.get("include_thinking", False),
            redact_sensitive=data.get("redact_sensitive", False),
            created_at=data.get("created_at"),
        )
