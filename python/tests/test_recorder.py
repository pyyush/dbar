"""Tests for dbar.recorder.DBARRecorder.

Tests verify behavior (output snapshots and capsule files) rather than
internal implementation details.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path

import pytest

from dbar.recorder import DBARRecorder
from tests.conftest import MockAgent, append_mock_step, make_mock_agent


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
        """Given history grows one step at a time, when captured, then indices increment."""
        agent = MockAgent()
        recorder = DBARRecorder(output_dir=tmp_output_dir)

        for step_number in range(3):
            append_mock_step(agent, url=f"https://example.com/{step_number}")
            await recorder.on_step_end(agent)

        assert [snapshot.index for snapshot in recorder._snapshots] == [0, 1, 2]
        assert recorder._snapshots[-1].url == "https://example.com/2"

    @pytest.mark.asyncio
    async def test_should_hash_live_dom_representation_with_sha256_when_present(self, mock_agent, tmp_output_dir):
        """Given live browser state, when captured, then dom_hash hashes the live DOM representation."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)

        dom_text = mock_agent.browser_session.live_state.dom_state.eval_representation()
        expected_hash = hashlib.sha256(dom_text.encode("utf-8")).hexdigest()
        assert recorder._snapshots[0].dom_hash == expected_hash

    @pytest.mark.asyncio
    async def test_should_hash_screenshot_bytes_when_screenshot_present(
        self, mock_agent_with_screenshot, tmp_output_dir
    ):
        """Given a screenshot, when captured, then screenshot_hash hashes the decoded screenshot bytes."""
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_screenshots=True)
        await recorder.on_step_end(mock_agent_with_screenshot)

        screenshot_data = mock_agent_with_screenshot.browser_session.live_state.screenshot
        expected_hash = hashlib.sha256(base64.b64decode(screenshot_data)).hexdigest()
        assert recorder._snapshots[0].screenshot_hash == expected_hash

    @pytest.mark.asyncio
    async def test_should_fallback_to_screenshot_path_when_live_screenshot_missing(self, tmp_output_dir, tmp_path):
        """Given only a history screenshot path, when captured, then screenshot_hash is still recorded."""
        screenshot_path = tmp_path / "step.png"
        screenshot_bytes = b"fake-png"
        screenshot_path.write_bytes(screenshot_bytes)

        agent = MockAgent()
        append_mock_step(
            agent,
            screenshot_path=str(screenshot_path),
            live_screenshot=None,
        )
        recorder = DBARRecorder(output_dir=tmp_output_dir, include_screenshots=True)

        await recorder.on_step_end(agent)

        expected_hash = hashlib.sha256(screenshot_bytes).hexdigest()
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
        assert recorder._snapshots[0].action == '[{"click":{"text":"click button"}}]'

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

    @pytest.mark.asyncio
    async def test_should_ignore_repeated_hook_calls_for_same_history_length(self, mock_agent, tmp_output_dir):
        """Given the same history step twice, when the hook repeats, then no duplicate snapshot is added."""
        recorder = DBARRecorder(output_dir=tmp_output_dir)
        await recorder.on_step_end(mock_agent)
        await recorder.on_step_end(mock_agent)
        assert len(recorder._snapshots) == 1


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
        """Given no screenshot anywhere, when captured, then screenshot_hash is None."""
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
        with open(capsule_path, encoding="utf-8") as f:
            data = json.load(f)
        assert data["step_count"] == 1
        assert capsule.step_count == 1

    @pytest.mark.asyncio
    async def test_should_return_capsule_object_when_finish_called(self, mock_agent, tmp_output_dir):
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
