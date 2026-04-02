"""Mock browser-use objects for hermetic testing.

These simple classes mimic the browser-use Agent, AgentHistory, and related
types without importing browser-use. This keeps tests fast and dependency-free.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional

import pytest


@dataclass
class MockActionResult:
    """Mimics browser-use ActionResult."""

    extracted_content: Optional[str] = None
    error: Optional[str] = None
    is_done: bool = False


@dataclass
class MockAgentOutput:
    """Mimics browser-use AgentOutput (model response)."""

    current_state: Optional[MockAgentState] = None
    action: Optional[List[Any]] = None


@dataclass
class MockAgentState:
    """Mimics the current_state field of AgentOutput."""

    evaluation_previous_goal: str = ""
    memory: str = ""
    next_goal: str = ""


@dataclass
class MockBrowserStateHistory:
    """Mimics browser-use BrowserStateHistory (page state at a step)."""

    url: str = "https://example.com"
    title: str = "Example"
    tabs: List[Any] = field(default_factory=list)
    screenshot: Optional[str] = None  # base64 PNG
    element_tree: Optional[MockDOMTree] = None


@dataclass
class MockDOMTree:
    """Mimics a simplified DOM element tree."""

    tag_name: str = "html"
    text: str = ""
    children: List[Any] = field(default_factory=list)

    def to_string(self) -> str:
        return f"<{self.tag_name}>{self.text}</{self.tag_name}>"


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
class MockAgent:
    """Mimics browser-use Agent with a history attribute."""

    history: MockHistoryList = field(default_factory=MockHistoryList)


def make_mock_agent(
    url: str = "https://example.com",
    title: str = "Example",
    screenshot: Optional[str] = None,
    dom_text: str = "<html>hello</html>",
    action_text: Optional[str] = "click button",
    thinking: Optional[str] = None,
    num_steps: int = 1,
) -> MockAgent:
    """Create a MockAgent with pre-populated history steps.

    Args:
        url: Page URL for each step.
        title: Page title for each step.
        screenshot: Base64 screenshot string, or None.
        dom_text: Raw DOM text for hashing.
        action_text: Action description, or None.
        thinking: Model thinking text, or None.
        num_steps: Number of history steps to create.

    Returns:
        A MockAgent ready for use in recorder tests.
    """
    agent = MockAgent()
    for i in range(num_steps):
        dom_tree = MockDOMTree(text=dom_text)
        state = MockBrowserStateHistory(
            url=url,
            title=title,
            screenshot=screenshot,
            element_tree=dom_tree,
        )
        model_output = None
        if action_text or thinking:
            agent_state = MockAgentState(next_goal=thinking or "")
            model_output = MockAgentOutput(
                current_state=agent_state,
                action=[{"action": action_text}] if action_text else None,
            )
        result = [MockActionResult(extracted_content=action_text)]
        metadata = MockStepMetadata(step_id=i)
        entry = MockAgentHistory(
            state=state,
            model_output=model_output,
            result=result,
            metadata=metadata,
        )
        agent.history.history.append(entry)
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
def tmp_output_dir(tmp_path):
    """Provide a temporary output directory for capsule writing."""
    return str(tmp_path / "capsule_output")
