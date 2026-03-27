"""Tests for dbar.capsule.Capsule.

Tests verify loading, diffing, and summarizing capsule data without
touching the filesystem beyond pytest tmp_path.
"""

from __future__ import annotations

import json
import os

import pytest

from dbar.capsule import Capsule
from dbar.types import CapsuleManifest


def _write_capsule_json(path: str, manifest: CapsuleManifest) -> None:
    """Helper: write a CapsuleManifest to a JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(manifest.to_dict(), f)


class TestCapsuleLoad:
    """Verify loading capsules from JSON files."""

    def test_should_load_capsule_when_valid_json(self, tmp_path):
        """Given a valid capsule.json, when load is called, then a Capsule is returned."""
        path = str(tmp_path / "capsule.json")
        manifest = CapsuleManifest(step_count=3, steps=[
            {"index": 0, "dom_hash": "aaa"},
            {"index": 1, "dom_hash": "bbb"},
            {"index": 2, "dom_hash": "ccc"},
        ])
        _write_capsule_json(path, manifest)
        capsule = Capsule.load(path)
        assert capsule.step_count == 3
        assert capsule.path == path

    def test_should_raise_when_file_not_found(self):
        """Given a nonexistent path, when load is called, then FileNotFoundError is raised."""
        with pytest.raises(FileNotFoundError):
            Capsule.load("/nonexistent/capsule.json")

    def test_should_raise_when_invalid_json(self, tmp_path):
        """Given a file with invalid JSON, when load is called, then ValueError is raised."""
        path = str(tmp_path / "bad.json")
        with open(path, "w") as f:
            f.write("not json{{{")
        with pytest.raises(ValueError, match="Failed to parse"):
            Capsule.load(path)

    def test_should_compute_size_kb(self, tmp_path):
        """Given a capsule file, when loaded, then size_kb reflects file size."""
        path = str(tmp_path / "capsule.json")
        manifest = CapsuleManifest(step_count=0, steps=[])
        _write_capsule_json(path, manifest)
        capsule = Capsule.load(path)
        file_size = os.path.getsize(path)
        assert capsule.size_kb == pytest.approx(file_size / 1024, abs=0.01)


class TestCapsuleDiff:
    """Verify step-by-step DOM hash comparison between capsules."""

    def test_should_return_empty_diff_when_capsules_identical(self, tmp_path):
        """Given two identical capsules, when diff is called, then no divergences are returned."""
        steps = [{"index": 0, "dom_hash": "aaa"}, {"index": 1, "dom_hash": "bbb"}]
        path_a = str(tmp_path / "a.json")
        path_b = str(tmp_path / "b.json")
        _write_capsule_json(path_a, CapsuleManifest(step_count=2, steps=steps))
        _write_capsule_json(path_b, CapsuleManifest(step_count=2, steps=steps))
        a = Capsule.load(path_a)
        b = Capsule.load(path_b)
        divergences = a.diff(b)
        assert divergences == []

    def test_should_detect_divergence_when_dom_hashes_differ(self, tmp_path):
        """Given capsules with different DOM hashes at step 1, when diff is called, then step 1 is flagged."""
        path_a = str(tmp_path / "a.json")
        path_b = str(tmp_path / "b.json")
        _write_capsule_json(path_a, CapsuleManifest(step_count=2, steps=[
            {"index": 0, "dom_hash": "aaa"},
            {"index": 1, "dom_hash": "bbb"},
        ]))
        _write_capsule_json(path_b, CapsuleManifest(step_count=2, steps=[
            {"index": 0, "dom_hash": "aaa"},
            {"index": 1, "dom_hash": "xxx"},
        ]))
        a = Capsule.load(path_a)
        b = Capsule.load(path_b)
        divergences = a.diff(b)
        assert len(divergences) == 1
        assert divergences[0]["step"] == 1
        assert divergences[0]["field"] == "dom_hash"

    def test_should_handle_different_step_counts(self, tmp_path):
        """Given capsules with different step counts, when diff is called, then extra steps are flagged."""
        path_a = str(tmp_path / "a.json")
        path_b = str(tmp_path / "b.json")
        _write_capsule_json(path_a, CapsuleManifest(step_count=3, steps=[
            {"index": 0, "dom_hash": "aaa"},
            {"index": 1, "dom_hash": "bbb"},
            {"index": 2, "dom_hash": "ccc"},
        ]))
        _write_capsule_json(path_b, CapsuleManifest(step_count=1, steps=[
            {"index": 0, "dom_hash": "aaa"},
        ]))
        a = Capsule.load(path_a)
        b = Capsule.load(path_b)
        divergences = a.diff(b)
        assert any(d["type"] == "step_count_mismatch" for d in divergences)

    def test_should_detect_screenshot_hash_divergence(self, tmp_path):
        """Given capsules with different screenshot hashes, when diff is called, then flagged."""
        path_a = str(tmp_path / "a.json")
        path_b = str(tmp_path / "b.json")
        _write_capsule_json(path_a, CapsuleManifest(step_count=1, steps=[
            {"index": 0, "dom_hash": "aaa", "screenshot_hash": "s1"},
        ]))
        _write_capsule_json(path_b, CapsuleManifest(step_count=1, steps=[
            {"index": 0, "dom_hash": "aaa", "screenshot_hash": "s2"},
        ]))
        a = Capsule.load(path_a)
        b = Capsule.load(path_b)
        divergences = a.diff(b)
        assert len(divergences) == 1
        assert divergences[0]["field"] == "screenshot_hash"

    def test_should_skip_comparison_when_hash_missing_on_both_sides(self, tmp_path):
        """Given steps with no dom_hash on either side, when diff is called, then no divergence."""
        path_a = str(tmp_path / "a.json")
        path_b = str(tmp_path / "b.json")
        _write_capsule_json(path_a, CapsuleManifest(step_count=1, steps=[
            {"index": 0},
        ]))
        _write_capsule_json(path_b, CapsuleManifest(step_count=1, steps=[
            {"index": 0},
        ]))
        a = Capsule.load(path_a)
        b = Capsule.load(path_b)
        divergences = a.diff(b)
        assert divergences == []


class TestCapsuleSummary:
    """Verify human-readable summary output."""

    def test_should_include_step_count_in_summary(self, tmp_path):
        """Given a capsule, when summary is called, then step count is included."""
        path = str(tmp_path / "capsule.json")
        _write_capsule_json(path, CapsuleManifest(step_count=5, steps=[
            {"index": i, "dom_hash": f"h{i}"} for i in range(5)
        ]))
        capsule = Capsule.load(path)
        text = capsule.summary()
        assert "5" in text
        assert "step" in text.lower()

    def test_should_include_path_in_summary(self, tmp_path):
        """Given a capsule, when summary is called, then the file path is included."""
        path = str(tmp_path / "capsule.json")
        _write_capsule_json(path, CapsuleManifest(step_count=0, steps=[]))
        capsule = Capsule.load(path)
        text = capsule.summary()
        assert str(tmp_path) in text

    def test_should_include_size_in_summary(self, tmp_path):
        """Given a capsule, when summary is called, then size is mentioned."""
        path = str(tmp_path / "capsule.json")
        _write_capsule_json(path, CapsuleManifest(step_count=0, steps=[]))
        capsule = Capsule.load(path)
        text = capsule.summary()
        assert "kb" in text.lower() or "KB" in text

    def test_should_include_version_in_summary(self, tmp_path):
        """Given a capsule, when summary is called, then version is included."""
        path = str(tmp_path / "capsule.json")
        _write_capsule_json(path, CapsuleManifest(version="0.1.0", step_count=0, steps=[]))
        capsule = Capsule.load(path)
        text = capsule.summary()
        assert "0.1.0" in text

    def test_should_report_zero_steps_gracefully(self, tmp_path):
        """Given a capsule with no steps, when summary is called, then it handles zero gracefully."""
        path = str(tmp_path / "capsule.json")
        _write_capsule_json(path, CapsuleManifest(step_count=0, steps=[]))
        capsule = Capsule.load(path)
        text = capsule.summary()
        assert "0" in text
