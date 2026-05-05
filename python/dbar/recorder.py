"""DBAR recorder for browser-use agent sessions.

Captures per-step data (page-state hashes, screenshots, actions, thinking)
from a browser-use Agent, hashes content with SHA-256, and writes a
capsule JSON file when finished.

Uses ``from __future__ import annotations`` and TYPE_CHECKING to avoid
importing browser-use at runtime — the recorder works with any object
that has the expected ``history.history`` attribute shape.
"""

from __future__ import annotations

import base64
import hashlib
import inspect
import json
import os
from datetime import datetime, timezone
from pathlib import Path
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
        include_dom: Whether to hash and record page-state representations.
        include_actions: Whether to record browser actions.
        include_thinking: Whether to record model reasoning/thinking.
        redact_sensitive: Whether to redact URL query parameters.

    Example:
        >>> recorder = DBARRecorder(output_dir="./capsules")
        >>> agent = Agent(task="...")
        >>> await agent.run(on_step_end=recorder.on_step_end)
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
        self._captured_history_length = 0

    async def on_step_end(self, agent: Any) -> None:
        """Extract and record data from the agent's latest history step.

        This method is designed to be passed as the ``on_step_end`` callback
        to a browser-use Agent. It records any new entries in
        ``agent.history.history`` and prefers the live browser_session state
        when browser-use exposes it.

        Args:
            agent: A browser-use Agent (or mock) with a
                ``history.history`` list of step entries.
        """
        history = getattr(agent, "history", None)
        history_list = getattr(history, "history", None)
        if not history_list:
            return

        # Capture only unseen steps if the hook is called multiple times.
        unseen_steps = history_list[self._captured_history_length :]
        if not unseen_steps:
            return

        live_state = await self._get_live_browser_state(agent)

        for position, step in enumerate(unseen_steps):
            current_live_state = live_state if position == len(unseen_steps) - 1 else None
            snapshot = self._build_snapshot(
                step=step,
                index=len(self._snapshots),
                live_state=current_live_state,
            )
            self._snapshots.append(snapshot)

        self._captured_history_length = len(history_list)

    def _build_snapshot(self, step: Any, index: int, live_state: Any) -> StepSnapshot:
        """Build a snapshot for a single history step."""
        state = getattr(step, "state", None)

        dom_hash: Optional[str] = None
        screenshot_hash: Optional[str] = None
        action: Optional[str] = None
        thinking: Optional[str] = None
        url = self._extract_url(live_state, state)

        if self._redact_sensitive and url:
            url = self._redact_url(url)

        if self._include_dom:
            dom_hash = self._extract_dom_hash(live_state, state)

        if self._include_screenshots:
            screenshot_hash = self._extract_screenshot_hash(live_state, state)

        if self._include_actions:
            model_output = getattr(step, "model_output", None)
            if model_output is not None:
                action_list = getattr(model_output, "action", None)
                if action_list:
                    action = self._serialize_jsonish(action_list)

        if self._include_thinking:
            model_output = getattr(step, "model_output", None)
            if model_output is not None:
                next_goal = getattr(model_output, "next_goal", None)
                if not next_goal:
                    current_state = getattr(model_output, "current_state", None)
                    if current_state is not None:
                        next_goal = getattr(current_state, "next_goal", None)
                if next_goal:
                    thinking = next_goal

        timestamp = datetime.now(timezone.utc).isoformat()

        return StepSnapshot(
            index=index,
            dom_hash=dom_hash,
            screenshot_hash=screenshot_hash,
            action=action,
            thinking=thinking,
            url=url,
            timestamp=timestamp,
        )

    async def _get_live_browser_state(self, agent: Any) -> Any:
        """Ask browser-use for the current browser state when available.

        browser-use exposes a stable public browser_session surface. Prefer it
        over history-only fields because recent browser-use history objects store
        screenshot paths and interacted elements, not a full DOM snapshot.
        """
        browser_session = getattr(agent, "browser_session", None)
        if browser_session is None:
            return None

        get_state = getattr(browser_session, "get_browser_state_summary", None)
        if not callable(get_state):
            return None

        try:
            result = get_state(include_screenshot=self._include_screenshots)
        except TypeError:
            result = get_state()
        except Exception:
            return None

        try:
            if inspect.isawaitable(result):
                return await result
            return result
        except Exception:
            return None

    def _extract_url(self, live_state: Any, history_state: Any) -> Optional[str]:
        """Extract the best available URL for the current step."""
        url = getattr(live_state, "url", None)
        if url:
            return url
        return getattr(history_state, "url", None)

    def _extract_dom_hash(self, live_state: Any, history_state: Any) -> Optional[str]:
        """Hash the richest available page-state representation."""
        dom_state = getattr(live_state, "dom_state", None)
        if dom_state is not None:
            representation = None
            eval_representation = getattr(dom_state, "eval_representation", None)
            if callable(eval_representation):
                representation = eval_representation()
            elif callable(getattr(dom_state, "llm_representation", None)):
                representation = dom_state.llm_representation()

            if representation:
                return hashlib.sha256(representation.encode("utf-8")).hexdigest()

            selector_map = getattr(dom_state, "selector_map", None)
            if selector_map:
                return self._hash_jsonish(selector_map)

        element_tree = getattr(history_state, "element_tree", None)
        if element_tree is not None and callable(getattr(element_tree, "to_string", None)):
            dom_text = element_tree.to_string()
            return hashlib.sha256(dom_text.encode("utf-8")).hexdigest()

        interacted_elements = getattr(history_state, "interacted_element", None)
        if interacted_elements:
            return self._hash_jsonish(interacted_elements)

        return None

    def _extract_screenshot_hash(self, live_state: Any, history_state: Any) -> Optional[str]:
        """Hash the richest available screenshot representation."""
        live_screenshot = getattr(live_state, "screenshot", None)
        if live_screenshot:
            return self._hash_screenshot_data(live_screenshot)

        get_screenshot = getattr(history_state, "get_screenshot", None)
        if callable(get_screenshot):
            history_screenshot = get_screenshot()
            if history_screenshot:
                return self._hash_screenshot_data(history_screenshot)

        history_screenshot = getattr(history_state, "screenshot", None)
        if history_screenshot:
            return self._hash_screenshot_data(history_screenshot)

        screenshot_path = getattr(history_state, "screenshot_path", None)
        if screenshot_path:
            path = Path(screenshot_path)
            if path.exists():
                return hashlib.sha256(path.read_bytes()).hexdigest()

        return None

    @staticmethod
    def _hash_screenshot_data(data: str) -> str:
        """Hash screenshot bytes, falling back to hashing the raw string."""
        try:
            raw = base64.b64decode(data, validate=True)
            return hashlib.sha256(raw).hexdigest()
        except Exception:
            return hashlib.sha256(data.encode("utf-8")).hexdigest()

    def _hash_jsonish(self, value: Any) -> str:
        """Canonicalize a JSON-like value and hash it."""
        payload = self._serialize_jsonish(value)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _serialize_jsonish(self, value: Any) -> str:
        """Serialize common browser-use objects to stable JSON."""
        normalized = self._normalize_jsonish(value)
        return json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

    def _normalize_jsonish(self, value: Any) -> Any:
        """Convert browser-use and mock objects into JSON-serializable data."""
        if hasattr(value, "model_dump") and callable(value.model_dump):
            return self._normalize_jsonish(value.model_dump(exclude_none=True, mode="json"))
        if hasattr(value, "to_dict") and callable(value.to_dict):
            return self._normalize_jsonish(value.to_dict())
        if isinstance(value, dict):
            return {str(key): self._normalize_jsonish(val) for key, val in value.items()}
        if isinstance(value, (list, tuple)):
            return [self._normalize_jsonish(item) for item in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

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
