#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

SENSITIVE_PATH_PARTS = (
    "/references/",
    "/assets/",
    "/examples/",
    "/fixtures/",
    "/samples/",
    "/logs/",
    "/traces/",
    "/private/",
)
SENSITIVE_NAME_RE = re.compile(r"(resume|cv|profile|passport|statement|transcript|recording|notes?)", re.I)
ABSOLUTE_PATH_RE = re.compile(r"(/Users/|/home/|~/|C:\\\\Users\\\\|Library/Mobile Documents|file://)")


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def classify_paths(paths: list[str]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for path in paths:
        normalized = "/" + path.strip().replace("\\", "/")
        if any(part in normalized for part in SENSITIVE_PATH_PARTS):
            findings.append({"kind": "sensitive-path-zone", "path": path})
        if SENSITIVE_NAME_RE.search(Path(path).name):
            findings.append({"kind": "sensitive-filename", "path": path})
    return findings


def classify_content_lines(lines: list[str]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for content in lines:
        if "ABSOLUTE_PATH_RE = re.compile" in content:
            continue
        if ABSOLUTE_PATH_RE.search(content):
            findings.append({"kind": "absolute-path", "line": content[:240]})
    return findings


def classify_diff(diff_text: str) -> list[dict[str, str]]:
    added_lines = [line[1:] for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++")]
    return classify_content_lines(added_lines)


def read_untracked_file_lines(repo: Path, rel_path: str) -> list[str]:
    path = repo / rel_path
    if not path.is_file() or path.stat().st_size > 200_000:
        return []
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return []


def tracked_private_files(repo: Path) -> list[str]:
    output = git(repo, "ls-files")
    tracked: list[str] = []
    for line in output.splitlines():
        normalized = "/" + line.replace("\\", "/")
        if "/private/" in normalized and not line.endswith(".gitkeep"):
            tracked.append(line)
    return tracked


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: check_sensitive_surface.py <repo-path> [<base-rev>]")

    repo = Path(sys.argv[1]).expanduser().resolve()
    base_rev = sys.argv[2] if len(sys.argv) > 2 else None

    name_sets: list[str] = []
    diff_chunks: list[str] = []
    if base_rev:
        name_sets.append(git(repo, "diff", "--name-only", f"{base_rev}...HEAD"))
        diff_chunks.append(git(repo, "diff", "--no-ext-diff", "-U0", f"{base_rev}...HEAD"))

    name_sets.append(git(repo, "diff", "--name-only", "HEAD"))
    diff_chunks.append(git(repo, "diff", "--no-ext-diff", "-U0", "HEAD"))
    untracked = [line for line in git(repo, "ls-files", "--others", "--exclude-standard").splitlines() if line.strip()]

    touched_files = sorted({line for block in name_sets for line in block.splitlines() if line.strip()} | set(untracked))
    findings = classify_paths(touched_files) + classify_diff("\n".join(diff_chunks))
    for rel_path in untracked:
        findings.extend(classify_content_lines(read_untracked_file_lines(repo, rel_path)))

    tracked_private = tracked_private_files(repo)
    for path in tracked_private:
        findings.append({"kind": "tracked-private-file", "path": path})

    sensitive_surface = bool(findings)
    reviewers: list[str] = []
    if sensitive_surface:
        reviewers.append("privacy/data-safety")

    payload = {
        "status": "sensitive" if sensitive_surface else "clean",
        "repo": str(repo),
        "base_rev": base_rev,
        "touched_files": touched_files,
        "recommended_reviewers": reviewers,
        "findings": findings,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
