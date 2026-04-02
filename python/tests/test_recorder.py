"""Tests for dbar.recorder.DBARRecorder.

Tests verify behavior (output snapshots and capsule files) rather than
internal implementation details.
"""

from __future__ import annotations

import hashlib
import json
import os

import pytest

from dbar.recorder import DBARRecorder
from dbar.types import StepSnapshot
from tests.conftest import make_mock_agent


class TestStepCapture:
    """Verify on_step_end extracts and hashes agent data correctly."""

    @pytest.mark.asyncio
    async def test_should_capture_step_when_agent_has_history(self, mock_agent, tmp_output_dir):
        """Given a mock agent with one step, when on_step_end is called, then a snapshot is recorded."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        assert len(recorder._snapshots) == 1
        assert recorder._snapshots[0].index == 0

    @pytest.mark.asyncio
    async def test_should_increment_index_when_multiple_steps_captured(self, tmp_output_dir):
        """Given an agent with multiple steps, when on_step_end is called for each, then indices increment."""
        agent = make_mock_agent(num_steps=3)
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        for _ in range(3):
            await recorder.on_step_end(agent)
        assert [s.index for s in recorder._snapshots] == [0, 1, 2]

    @pytest.mark.asyncio
    async def test_should_hash_dom_with_sha256_when_dom_present(self, mock_agent, tmp_output_dir):
        """Given DOM content, when captured, then dom_hash is the SHA-256 hex digest."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        dom_text = mock_agent.history.history[-1].state.element_tree.to_string()
        expected_hash = hashlib.sha256(dom_text.encode("utf-8")).hexdigest()
        assert recorder._snapshots[0].dom_hash == expected_hash

    @pytest.mark.asyncio
    async def test_should_hash_screenshot_when_screenshot_present(
        self, mock_agent_with_screenshot, tmp_output_dir
    ):
        """Given a screenshot, when captured, then screenshot_hash is the SHA-256 hex digest."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_screenshots=True)
        await recorder.on_step_end(mock_agent_with_screenshot)
        screenshot_data = mock_agent_with_screenshot.history.history[-1].state.screenshot
        expected_hash = hashlib.sha256(screenshot_data.encode("utf-8")).hexdigest()
        assert recorder._snapshots[0].screenshot_hash == expected_hash

    @pytest.mark.asyncio
    async def test_should_set_screenshot_hash_none_when_screenshots_disabled(
        self, mock_agent_with_screenshot, tmp_output_dir
    ):
        """Given screenshots disabled, when captured, then screenshot_hash is None."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_screenshots=False)
        await recorder.on_step_end(mock_agent_with_screenshot)
        assert recorder._snapshots[0].screenshot_hash is None

    @pytest.mark.asyncio
    async def test_should_capture_action_when_action_present(self, mock_agent, tmp_output_dir):
        """Given an action in the step, when captured, then action is recorded."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_actions=True)
        await recorder.on_step_end(mock_agent)
        assert recorder._snapshots[0].action is not None

    @pytest.mark.asyncio
    async def test_should_skip_action_when_actions_disabled(self, mock_agent, tmp_output_dir):
        """Given actions disabled, when captured, then action is None."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_actions=False)
        await recorder.on_step_end(mock_agent)
        assert recorder._snapshots[0].action is None

    @pytest.mark.asyncio
    async def test_should_capture_url_when_state_present(self, mock_agent, tmp_output_dir):
        """Given a page URL, when captured, then url is recorded in snapshot."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        assert recorder._snapshots[0].url == "https://example.com"

    @pytest.mark.asyncio
    async def test_should_set_dom_hash_none_when_dom_disabled(self, mock_agent, tmp_output_dir):
        """Given DOM capture disabled, when captured, then dom_hash is None."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_dom=False)
        await recorder.on_step_end(mock_agent)
        assert recorder._snapshots[0].dom_hash is None

    @pytest.mark.asyncio
    async def test_should_capture_thinking_when_enabled(self, tmp_output_dir):
        """Given thinking enabled and model output has state, when captured, then thinking is recorded."""
        agent = make_mock_agent(thinking="I need to click the button")
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_thinking=True)
        await recorder.on_step_end(agent)
        assert recorder._snapshots[0].thinking == "I need to click the button"

    @pytest.mark.asyncio
    async def test_should_skip_thinking_when_disabled(self, tmp_output_dir):
        """Given thinking disabled, when captured, then thinking is None."""
        agent = make_mock_agent(thinking="secret thoughts")
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_thinking=False)
        await recorder.on_step_end(agent)
        assert recorder._snapshots[0].thinking is None


class TestRedaction:
    """Verify sensitive data redaction."""

    @pytest.mark.asyncio
    async def test_should_redact_url_params_when_redact_enabled(self, tmp_output_dir):
        """Given redact_sensitive=True, when URL has query params, then params are redacted."""
        agent = make_mock_agent(url="https://example.com/page?token=secret123&id=42")
        recorder = DBARRecorder(output_dir=tmp_output_dir, redact_sensitive=True)
        await recorder.on_step_end(agent)
        url = recorder._snapshots[0].url
        assert "secret123" not in url
        assert "REDACTED" in url


class TestMissingData:
    """Verify graceful handling of missing or None data."""

    @pytest.mark.asyncio
    async def test_should_handle_no_model_output(self, mock_agent_no_action, tmp_output_dir):
        """Given no model output, when captured, then action and thinking are None."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent_no_action)
        assert recorder._snapshots[0].action is None

    @pytest.mark.asyncio
    async def test_should_handle_no_screenshot_in_state(self, mock_agent, tmp_output_dir):
        """Given no screenshot in state, when captured, then screenshot_hash is None."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_screenshots=True)
        await recorder.on_step_end(mock_agent)
        assert recorder._snapshots[0].screenshot_hash is None


class TestFinish:
    """Verify capsule writing and finish behavior."""

    @pytest.mark.asyncio
    async def test_should_write_capsule_json_when_finish_called(self, mock_agent, tmp_output_dir):
        """Given recorded steps, when finish is called, then capsule.json is written."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        capsule = recorder.finish()
        capsule_path = os.path.join(tmp_output_dir, "capsule.json")
        assert os.path.exists(capsule_path)
        with open(capsule_path) as f:
            data = json.load(f)
        assert data["step_count"] == 1

    @pytest.mark.asyncio
    async def test_should_return_capsule_object_when_finish_called(
        self, mock_agent, tmp_output_dir
    ):
        """Given recorded steps, when finish is called, then a Capsule object is returned."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        capsule = recorder.finish()
        assert capsule.step_count == 1
        assert capsule.path == os.path.join(tmp_output_dir, "capsule.json")

    @pytest.mark.asyncio
    async def test_should_raise_when_finish_called_twice(self, mock_agent, tmp_output_dir):
        """Given finish already called, when finish is called again, then RuntimeError is raised."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        recorder.finish()
        with pytest.raises(RuntimeError, match="already finished"):
            recorder.finish()

    @pytest.mark.asyncio
    async def test_should_write_capsule_with_zero_steps_when_no_data(self, tmp_output_dir):
        """Given no steps recorded, when finish is called, then capsule has zero steps."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        capsule = recorder.finish()
        assert capsule.step_count == 0

    @pytest.mark.asyncio
    async def test_should_record_capsule_size_in_kb(self, mock_agent, tmp_output_dir):
        """Given a written capsule, when finish returns, then size_kb is positive."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        capsule = recorder.finish()
        assert capsule.size_kb > 0
