#!/usr/bin/env python3
"""Focused tests for check_sensitive_surface.py.

Run with:
  PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_check_sensitive_surface.py
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("check_sensitive_surface.py")


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True)


def git(repo: Path, *args: str) -> str:
    return run(["git", "-C", str(repo), *args]).stdout


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


class ScannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        run(["git", "init", str(self.repo)])
        git(self.repo, "config", "user.email", "scanner@example.invalid")
        git(self.repo, "config", "user.name", "Scanner Test")
        write(self.repo / "README.md", "# test\n")
        git(self.repo, "add", "README.md")
        git(self.repo, "commit", "-m", "init")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def scan(self, *args: str, check: bool = True) -> tuple[int, dict[str, object], str]:
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        result = subprocess.run(
            ["python3", str(SCRIPT), str(self.repo), *args],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        if check and result.returncode != 0:
            self.fail(f"scanner failed with {result.returncode}: {result.stderr}")
        payload = json.loads(result.stdout) if result.stdout else {}
        return result.returncode, payload, result.stderr

    def finding_kinds(self, payload: dict[str, object]) -> set[str]:
        findings = payload.get("findings", [])
        self.assertIsInstance(findings, list)
        return {finding["kind"] for finding in findings if isinstance(finding, dict)}

    def test_clean_repo_is_clean(self) -> None:
        _, payload, _ = self.scan()

        self.assertEqual(payload["schema_version"], 1)
        self.assertEqual(payload["status"], "clean")
        self.assertEqual(payload["recommended_reviewers"], [])
        self.assertEqual(payload["findings"], [])

    def test_sensitive_zone_and_absolute_path_are_reported_with_redaction(self) -> None:
        write(self.repo / "references" / "notes.md", "local = /Users/alex/private/report.pdf\n")

        _, payload, _ = self.scan()

        kinds = self.finding_kinds(payload)
        self.assertIn("sensitive-path-zone", kinds)
        self.assertIn("absolute-path", kinds)
        lines = [finding.get("line", "") for finding in payload["findings"] if isinstance(finding, dict)]
        self.assertTrue(any("<absolute-path>" in line for line in lines))
        self.assertFalse(any("/Users/alex" in line for line in lines))
        self.assertEqual(payload["recommended_reviewers"], ["privacy/data-safety"])

    def test_untracked_sensitive_filename_is_reported(self) -> None:
        write(self.repo / "candidate-resume.md", "placeholder\n")

        _, payload, _ = self.scan()

        self.assertEqual(payload["status"], "sensitive")
        self.assertIn("sensitive-filename", self.finding_kinds(payload))

    def test_tracked_private_file_is_reported_even_when_unchanged(self) -> None:
        write(self.repo / "private" / "secret.txt", "do not commit\n")
        git(self.repo, "add", "private/secret.txt")
        git(self.repo, "commit", "-m", "add private file")

        _, payload, _ = self.scan()

        self.assertEqual(payload["status"], "sensitive")
        self.assertIn("tracked-private-file", self.finding_kinds(payload))

    def test_repo_config_extends_path_detection(self) -> None:
        write(
            self.repo / ".sensitive-surface.json",
            json.dumps({"sensitive_path_parts": ["snapshots"]}),
        )
        write(self.repo / "snapshots" / "sample.txt", "fixture\n")

        _, payload, _ = self.scan()

        self.assertEqual(Path(payload["config"]).resolve(), (self.repo / ".sensitive-surface.json").resolve())
        self.assertIn("sensitive-path-zone", self.finding_kinds(payload))

    def test_config_content_pattern_redacts_matching_line(self) -> None:
        write(
            self.repo / ".sensitive-surface.json",
            json.dumps({"sensitive_content_patterns": ["SECRET_TOKEN"]}),
        )
        write(self.repo / "data.txt", "SECRET_TOKEN=abc123\n")

        _, payload, _ = self.scan()

        self.assertIn("sensitive-content", self.finding_kinds(payload))
        lines = [finding.get("line", "") for finding in payload["findings"] if isinstance(finding, dict)]
        self.assertIn("<sensitive-content>", lines)
        self.assertFalse(any("abc123" in line for line in lines))

    def test_config_ignore_paths_omits_matching_touched_files(self) -> None:
        write(
            self.repo / ".sensitive-surface.json",
            json.dumps({"ignore_paths": ["snapshots/**"]}),
        )
        write(self.repo / "snapshots" / "sample.txt", "fixture\n")

        _, payload, _ = self.scan()

        self.assertNotIn("snapshots/sample.txt", payload["touched_files"])

    def test_strict_returns_two_for_findings(self) -> None:
        write(self.repo / "profile.md", "placeholder\n")

        code, payload, _ = self.scan("--strict", check=False)

        self.assertEqual(code, 2)
        self.assertEqual(payload["status"], "sensitive")


if __name__ == "__main__":
    unittest.main()
