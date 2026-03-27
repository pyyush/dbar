"""DBAR recorder for browser-use agent sessions.

Captures per-step data (DOM, screenshots, actions, thinking) from a
browser-use Agent, hashes content with SHA-256, and writes a capsule
JSON file when finished.

Uses ``from __future__ import annotations`` and TYPE_CHECKING to avoid
importing browser-use at runtime — the recorder works with any object
that has the expected ``history.history`` attribute shape.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, List, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from dbar.types import CapsuleManifest, StepSnapshot

if TYPE_CHECKING:
    pass


class DBARRecorder:
    """Records browser-use agent steps into a DBAR capsule.

    Designed to be passed as the ``on_step_end`` hook to a browser-use Agent.
    After the agent finishes, call :meth:`finish` to write the capsule JSON
    and get a :class:`~dbar.capsule.Capsule` object.

    Args:
        output_dir: Directory where capsule.json will be written.
        include_screenshots: Whether to hash and record screenshots.
        include_dom: Whether to hash and record DOM snapshots.
        include_actions: Whether to record browser actions.
        include_thinking: Whether to record model reasoning/thinking.
        redact_sensitive: Whether to redact URL query parameters.

    Example:
        >>> recorder = DBARRecorder(output_dir="./capsules")
        >>> agent = Agent(task="...", on_step_end=recorder.on_step_end)
        >>> await agent.run()
        >>> capsule = recorder.finish()
    """

    def __init__(
        self,
        output_dir: str = "./dbar_output",
        include_screenshots: bool = True,
        include_dom: bool = True,
        include_actions: bool = True,
        include_thinking: bool = False,
        redact_sensitive: bool = False,
    ) -> None:
        self._output_dir = output_dir
        self._include_screenshots = include_screenshots
        self._include_dom = include_dom
        self._include_actions = include_actions
        self._include_thinking = include_thinking
        self._redact_sensitive = redact_sensitive
        self._snapshots: List[StepSnapshot] = []
        self._finished = False

    async def on_step_end(self, agent: Any) -> None:
        """Extract and record data from the agent's latest history step.

        This method is designed to be passed as the ``on_step_end`` callback
        to a browser-use Agent. It reads the last entry from
        ``agent.history.history`` and captures configured fields.

        Args:
            agent: A browser-use Agent (or mock) with a
                ``history.history`` list of step entries.
        """
        history_list = agent.history.history
        if not history_list:
            return

        step = history_list[-1]
        index = len(self._snapshots)

        dom_hash: Optional[str] = None
        screenshot_hash: Optional[str] = None
        action: Optional[str] = None
        thinking: Optional[str] = None
        url: Optional[str] = None

        # Extract state data
        state = getattr(step, "state", None)
        if state is not None:
            url = getattr(state, "url", None)
            if self._redact_sensitive and url:
                url = self._redact_url(url)

            if self._include_dom:
                element_tree = getattr(state, "element_tree", None)
                if element_tree is not None:
                    dom_text = element_tree.to_string()
                    dom_hash = hashlib.sha256(dom_text.encode("utf-8")).hexdigest()

            if self._include_screenshots:
                screenshot_data = getattr(state, "screenshot", None)
                if screenshot_data is not None:
                    screenshot_hash = hashlib.sha256(
                        screenshot_data.encode("utf-8")
                    ).hexdigest()

        # Extract action
        if self._include_actions:
            model_output = getattr(step, "model_output", None)
            if model_output is not None:
                action_list = getattr(model_output, "action", None)
                if action_list:
                    action = str(action_list)

        # Extract thinking
        if self._include_thinking:
            model_output = getattr(step, "model_output", None)
            if model_output is not None:
                current_state = getattr(model_output, "current_state", None)
                if current_state is not None:
                    next_goal = getattr(current_state, "next_goal", None)
                    if next_goal:
                        thinking = next_goal

        timestamp = datetime.now(timezone.utc).isoformat()

        snapshot = StepSnapshot(
            index=index,
            dom_hash=dom_hash,
            screenshot_hash=screenshot_hash,
            action=action,
            thinking=thinking,
            url=url,
            timestamp=timestamp,
        )
        self._snapshots.append(snapshot)

    def finish(self) -> "Capsule":
        """Write the capsule JSON and return a Capsule object.

        Creates ``output_dir`` if it does not exist, writes ``capsule.json``,
        and returns a loaded :class:`~dbar.capsule.Capsule`.

        Returns:
            A Capsule object representing the written file.

        Raises:
            RuntimeError: If ``finish()`` has already been called on this recorder.
        """
        # Lazy import to avoid circular dependency (capsule imports types,
        # recorder imports types, __init__ imports both)
        from dbar.capsule import Capsule

        if self._finished:
            raise RuntimeError(
                "Recorder already finished — each DBARRecorder can only be "
                "finished once. Create a new recorder for a new session."
            )
        self._finished = True

        os.makedirs(self._output_dir, exist_ok=True)

        manifest = CapsuleManifest(
            version="0.1.0",
            step_count=len(self._snapshots),
            steps=[s.to_dict() for s in self._snapshots],
            include_screenshots=self._include_screenshots,
            include_dom=self._include_dom,
            include_actions=self._include_actions,
            include_thinking=self._include_thinking,
            redact_sensitive=self._redact_sensitive,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        capsule_path = os.path.join(self._output_dir, "capsule.json")
        with open(capsule_path, "w") as f:
            json.dump(manifest.to_dict(), f, indent=2)

        return Capsule.load(capsule_path)

    @staticmethod
    def _redact_url(url: str) -> str:
        """Replace all URL query parameter values with REDACTED.

        Args:
            url: The original URL string.

        Returns:
            The URL with all query parameter values replaced.
        """
        parsed = urlparse(url)
        if not parsed.query:
            return url
        params = parse_qs(parsed.query, keep_blank_values=True)
        redacted = {k: ["REDACTED"] for k in params}
        new_query = urlencode(redacted, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
