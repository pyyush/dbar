"""Mock browser-use objects for hermetic testing.

These simple classes mimic the browser-use Agent, AgentHistory, BrowserSession,
and related types without importing browser-use. This keeps tests fast and
dependency-free while matching recent browser-use shapes more closely.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Optional

import pytest


@dataclass
class MockActionResult:
    """Mimics browser-use ActionResult."""

    extracted_content: Optional[str] = None
    error: Optional[str] = None
    is_done: bool = False


@dataclass
class MockActionModel:
    """Mimics a browser-use action model with model_dump()."""

    payload: dict[str, Any]

    def model_dump(self, **_: Any) -> dict[str, Any]:
        return self.payload


@dataclass
class MockAgentOutput:
    """Mimics browser-use AgentOutput (model response)."""

    current_state: Optional["MockAgentState"] = None
    action: Optional[List[Any]] = None
    next_goal: Optional[str] = None


@dataclass
class MockAgentState:
    """Mimics the current_state field of AgentOutput."""

    evaluation_previous_goal: str = ""
    memory: str = ""
    next_goal: str = ""


@dataclass
class MockDOMInteractedElement:
    """Mimics browser-use DOMInteractedElement."""

    node_name: str = "button"
    attributes: Optional[dict[str, str]] = field(default_factory=lambda: {"aria-label": "Submit"})
    x_path: str = "/html/body/button"
    element_hash: int = 123
    stable_hash: Optional[int] = 123
    ax_name: Optional[str] = "Submit"

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_name": self.node_name,
            "attributes": self.attributes,
            "x_path": self.x_path,
            "element_hash": self.element_hash,
            "stable_hash": self.stable_hash,
            "ax_name": self.ax_name,
        }


@dataclass
class MockBrowserStateHistory:
    """Mimics browser-use BrowserStateHistory (persisted history shape)."""

    url: str = "https://example.com"
    title: str = "Example"
    tabs: List[Any] = field(default_factory=list)
    interacted_element: List[Any] = field(default_factory=list)
    screenshot_path: Optional[str] = None

    def get_screenshot(self) -> Optional[str]:
        """Load screenshot from disk and return as base64 string."""
        if not self.screenshot_path:
            return None

        path_obj = Path(self.screenshot_path)
        if not path_obj.exists():
            return None

        return base64.b64encode(path_obj.read_bytes()).decode("utf-8")


@dataclass
class MockDOMState:
    """Mimics browser-use SerializedDOMState."""

    text: str = "<html>hello</html>"

    def eval_representation(self, include_attributes: Optional[list[str]] = None) -> str:
        del include_attributes
        return self.text

    def llm_representation(self, include_attributes: Optional[list[str]] = None) -> str:
        del include_attributes
        return self.text


@dataclass
class MockBrowserStateSummary:
    """Mimics browser-use BrowserStateSummary (live browser state)."""

    url: str = "https://example.com"
    screenshot: Optional[str] = None
    dom_state: Optional[MockDOMState] = None


@dataclass
class MockStepMetadata:
    """Mimics browser-use step metadata."""

    step_id: int = 0
    step_start_time: float = 0.0
    step_end_time: float = 1.0


@dataclass
class MockAgentHistory:
    """Mimics a single entry in browser-use AgentHistory.history list."""

    state: Optional[MockBrowserStateHistory] = None
    model_output: Optional[MockAgentOutput] = None
    result: Optional[List[MockActionResult]] = field(default_factory=list)
    metadata: Optional[MockStepMetadata] = None


@dataclass
class MockHistoryList:
    """Mimics the AgentHistory container that holds a list of history entries."""

    history: List[MockAgentHistory] = field(default_factory=list)


@dataclass
class MockBrowserSession:
    """Mimics browser-use BrowserSession with live state access."""

    live_state: Optional[MockBrowserStateSummary] = None

    async def get_browser_state_summary(self, include_screenshot: bool = True) -> MockBrowserStateSummary:
        """Return a browser state summary, optionally dropping the screenshot."""
        if self.live_state is None:
            raise RuntimeError("No live state configured")

        screenshot = self.live_state.screenshot if include_screenshot else None
        return MockBrowserStateSummary(
            url=self.live_state.url,
            screenshot=screenshot,
            dom_state=self.live_state.dom_state,
        )


@dataclass
class MockAgent:
    """Mimics browser-use Agent with history and browser_session attributes."""

    history: MockHistoryList = field(default_factory=MockHistoryList)
    browser_session: MockBrowserSession = field(default_factory=MockBrowserSession)


def append_mock_step(
    agent: MockAgent,
    *,
    url: str = "https://example.com",
    title: str = "Example",
    live_dom_text: str = "<html>hello</html>",
    live_screenshot: Optional[str] = None,
    screenshot_path: Optional[str] = None,
    action_payload: Optional[dict[str, Any]] = None,
    thinking: Optional[str] = None,
    interacted_element: Optional[List[Any]] = None,
) -> MockAgent:
    """Append a step to an existing mock agent and update its live state."""
    model_output = None
    if action_payload is not None or thinking:
        agent_state = MockAgentState(next_goal=thinking or "")
        actions = [MockActionModel(action_payload)] if action_payload is not None else None
        model_output = MockAgentOutput(
            current_state=agent_state,
            action=actions,
            next_goal=thinking,
        )

    state = MockBrowserStateHistory(
        url=url,
        title=title,
        interacted_element=interacted_element or [MockDOMInteractedElement()],
        screenshot_path=screenshot_path,
    )
    result = [MockActionResult(extracted_content="ok")]
    metadata = MockStepMetadata(step_id=len(agent.history.history))
    agent.history.history.append(
        MockAgentHistory(
            state=state,
            model_output=model_output,
            result=result,
            metadata=metadata,
        )
    )
    agent.browser_session.live_state = MockBrowserStateSummary(
        url=url,
        screenshot=live_screenshot,
        dom_state=MockDOMState(text=live_dom_text),
    )
    return agent


def make_mock_agent(
    url: str = "https://example.com",
    title: str = "Example",
    screenshot: Optional[str] = None,
    dom_text: str = "<html>hello</html>",
    action_text: Optional[str] = "click button",
    thinking: Optional[str] = None,
    num_steps: int = 1,
) -> MockAgent:
    """Create a mock agent with pre-populated history steps."""
    agent = MockAgent()
    action_payload = {"click": {"text": action_text}} if action_text else None
    for _ in range(num_steps):
        append_mock_step(
            agent,
            url=url,
            title=title,
            live_dom_text=dom_text,
            live_screenshot=screenshot,
            action_payload=action_payload,
            thinking=thinking,
        )
    return agent


@pytest.fixture
def mock_agent() -> MockAgent:
    """Provide a single-step mock agent for recorder tests."""
    return make_mock_agent()


@pytest.fixture
def mock_agent_with_screenshot() -> MockAgent:
    """Provide a mock agent with a base64 screenshot."""
    return make_mock_agent(screenshot="iVBORw0KGgo=")


@pytest.fixture
def mock_agent_no_action() -> MockAgent:
    """Provide a mock agent with no action or model output."""
    return make_mock_agent(action_text=None, thinking=None)


@pytest.fixture
def tmp_output_dir(tmp_path: Path) -> str:
    """Provide a temporary output directory for capsule writing."""
    return str(tmp_path / "capsule_output")
