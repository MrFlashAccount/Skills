#!/usr/bin/env python3
"""Scan a git repo for sensitive-surface indicators.

This helper is intentionally self-contained so a global skill can run it
against any target repository without copying files into that repository.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

SCHEMA_VERSION = 1

DEFAULT_SENSITIVE_PATH_PARTS = (
    "/references/",
    "/assets/",
    "/examples/",
    "/fixtures/",
    "/samples/",
    "/logs/",
    "/traces/",
    "/private/",
)
MANDATORY_SENSITIVE_PATH_PARTS = (
    "/private/",
)
DEFAULT_SENSITIVE_NAME_PATTERNS = (
    r"(resume|cv|profile|passport|statement|transcript|recording|notes?)",
)
DEFAULT_SENSITIVE_CONTENT_PATTERNS = (
    r"(/Users/|/home/|~/|C:\\\\Users\\\\|Library/Mobile Documents|file://)",
)
ABSOLUTE_PATH_VALUE_RE = re.compile(
    r"(/Users/[^\s'\"),;]+|/home/[^\s'\"),;]+|~/[^\s'\"),;]+|"
    r"C:\\\\Users\\\\[^\s'\"),;]+|file://[^\s'\"),;]+|"
    r"Library/Mobile Documents[^\n'\"),;]*)"
)
DEFAULT_CONFIG_NAME = ".sensitive-surface.json"


class ScanError(RuntimeError):
    pass


def _compile_patterns(patterns: list[str], field_name: str) -> list[re.Pattern[str]]:
    compiled: list[re.Pattern[str]] = []
    for pattern in patterns:
        try:
            compiled.append(re.compile(pattern, re.I))
        except re.error as exc:
            raise ScanError(f"Invalid regex in {field_name}: {pattern!r}: {exc}") from exc
    return compiled


def _load_config(path: Path | None) -> dict[str, object]:
    if path is None or not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ScanError(f"Invalid JSON config at {path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise ScanError(f"Config at {path} must be a JSON object")
    return raw


def _string_list(config: dict[str, object], key: str) -> list[str]:
    value = config.get(key, [])
    if value is None:
        return []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ScanError(f"Config field {key!r} must be a list of strings")
    return value


def _normalize_path_part(part: str) -> str:
    normalized = part.strip().replace("\\", "/")
    if not normalized:
        return normalized
    if "/" not in normalized:
        return f"/{normalized}/"
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    return normalized


def _redact_line(line: str) -> str:
    return ABSOLUTE_PATH_VALUE_RE.sub("<absolute-path>", line)[:240]


def _is_mandatory_sensitive_path(path: str) -> bool:
    normalized = "/" + path.strip().replace("\\", "/")
    return any(part in normalized for part in MANDATORY_SENSITIVE_PATH_PARTS)


def _is_scanner_pattern_definition_line(path: str | None, content: str) -> bool:
    if path is None or Path(path).name != "check_sensitive_surface.py":
        return False

    stripped = content.strip()
    if stripped in {"DEFAULT_SENSITIVE_CONTENT_PATTERNS = (", "ABSOLUTE_PATH_VALUE_RE = re.compile("}:
        return True
    return (
        stripped.startswith('r"')
        and any(
            marker in stripped
            for marker in (
                "/Users/",
                "/home/",
                "~/",
                "C:\\\\\\\\Users",
                "file://",
                "Library/Mobile Documents",
            )
        )
    )


def git(repo: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise ScanError("git is not available on PATH") from exc
    except subprocess.CalledProcessError as exc:
        message = (exc.stderr or exc.stdout or "").strip()
        raise ScanError(f"git {' '.join(args)} failed: {message}") from exc
    return result.stdout


def resolve_repo(path: Path) -> Path:
    repo = path.expanduser().resolve()
    if not repo.exists():
        raise ScanError(f"Repository path does not exist: {repo}")
    if not repo.is_dir():
        raise ScanError(f"Repository path is not a directory: {repo}")
    root = git(repo, "rev-parse", "--show-toplevel").strip()
    if not root:
        raise ScanError(f"Path is not inside a git work tree: {repo}")
    return Path(root).resolve()


def classify_paths(
    paths: list[str],
    sensitive_path_parts: tuple[str, ...],
    sensitive_name_res: list[re.Pattern[str]],
    ignore_paths: tuple[str, ...],
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for path in paths:
        if should_ignore_path(path, ignore_paths):
            continue
        normalized = "/" + path.strip().replace("\\", "/")
        if any(part and part in normalized for part in sensitive_path_parts):
            findings.append({"kind": "sensitive-path-zone", "path": path})
        if any(pattern.search(Path(path).name) for pattern in sensitive_name_res):
            findings.append({"kind": "sensitive-filename", "path": path})
    return findings


def classify_content_lines(
    lines: list[str],
    sensitive_content_res: list[re.Pattern[str]],
    source_path: str | None = None,
) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for content in lines:
        if _is_scanner_pattern_definition_line(source_path, content):
            continue
        for pattern in sensitive_content_res:
            if pattern.search(content):
                if pattern.pattern in DEFAULT_SENSITIVE_CONTENT_PATTERNS:
                    findings.append({"kind": "absolute-path", "line": _redact_line(content)})
                else:
                    findings.append({"kind": "sensitive-content", "line": "<sensitive-content>"})
                break
    return findings


def classify_diff(diff_text: str, sensitive_content_res: list[re.Pattern[str]]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    current_path: str | None = None
    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current_path = line.removeprefix("+++ b/")
            continue
        if line.startswith("+++ /dev/null"):
            current_path = None
            continue
        if line.startswith("+") and not line.startswith("+++"):
            content = line[1:]
            findings.extend(classify_content_lines([content], sensitive_content_res, current_path))
    return findings


def read_untracked_file_lines(repo: Path, rel_path: str) -> list[str]:
    path = repo / rel_path
    if not path.is_file() or path.stat().st_size > 200_000:
        return []
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return []


def should_ignore_path(path: str, ignore_paths: tuple[str, ...]) -> bool:
    if _is_mandatory_sensitive_path(path):
        return False
    normalized = path.replace("\\", "/")
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in ignore_paths)


def tracked_private_files(repo: Path) -> list[str]:
    output = git(repo, "ls-files")
    tracked: list[str] = []
    for line in output.splitlines():
        normalized = "/" + line.replace("\\", "/")
        if "/private/" in normalized and not line.endswith(".gitkeep"):
            tracked.append(line)
    return tracked


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scan a git repo for sensitive-surface indicators and emit JSON.",
    )
    parser.add_argument(
        "repo_path",
        nargs="?",
        default=".",
        help="Target git repository path. Defaults to the current directory.",
    )
    parser.add_argument(
        "legacy_base_rev",
        nargs="?",
        help="Backward-compatible positional base revision. Prefer --base.",
    )
    parser.add_argument("--base", dest="base_rev", help="Base revision for committed-change diffing.")
    parser.add_argument(
        "--config",
        type=Path,
        help=f"Optional JSON config. Defaults to <repo>/{DEFAULT_CONFIG_NAME} when present.",
    )
    parser.add_argument(
        "--no-config",
        action="store_true",
        help=f"Do not auto-load <repo>/{DEFAULT_CONFIG_NAME}.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with status 2 when findings are present.",
    )
    return parser.parse_args(argv)


def _display_config_path(repo: Path, config_path: Path | None) -> str | None:
    if config_path is None:
        return None
    try:
        return config_path.relative_to(repo).as_posix()
    except ValueError:
        return "<external-config>"


def scan(repo: Path, base_rev: str | None, config_path: Path | None) -> dict[str, object]:
    config = _load_config(config_path)
    sensitive_path_parts = tuple(
        DEFAULT_SENSITIVE_PATH_PARTS
        + tuple(_normalize_path_part(part) for part in _string_list(config, "sensitive_path_parts"))
    )
    sensitive_name_res = _compile_patterns(
        list(DEFAULT_SENSITIVE_NAME_PATTERNS) + _string_list(config, "sensitive_filename_patterns"),
        "sensitive_filename_patterns",
    )
    sensitive_content_res = _compile_patterns(
        list(DEFAULT_SENSITIVE_CONTENT_PATTERNS) + _string_list(config, "sensitive_content_patterns"),
        "sensitive_content_patterns",
    )
    ignore_paths = tuple(_string_list(config, "ignore_paths"))
    name_sets: list[str] = []
    diff_chunks: list[str] = []
    if base_rev:
        name_sets.append(git(repo, "diff", "--name-only", f"{base_rev}...HEAD"))
        diff_chunks.append(git(repo, "diff", "--no-ext-diff", "-U0", f"{base_rev}...HEAD"))

    name_sets.append(git(repo, "diff", "--name-only", "HEAD"))
    diff_chunks.append(git(repo, "diff", "--no-ext-diff", "-U0", "HEAD"))
    untracked = [
        line
        for line in git(repo, "ls-files", "--others", "--exclude-standard").splitlines()
        if line.strip() and not should_ignore_path(line, ignore_paths)
    ]

    raw_touched_files = {line for block in name_sets for line in block.splitlines() if line.strip()} | set(untracked)
    touched_files = sorted(path for path in raw_touched_files if not should_ignore_path(path, ignore_paths))
    findings = (
        classify_paths(touched_files, sensitive_path_parts, sensitive_name_res, ignore_paths)
        + classify_diff("\n".join(diff_chunks), sensitive_content_res)
    )
    for rel_path in untracked:
        findings.extend(classify_content_lines(read_untracked_file_lines(repo, rel_path), sensitive_content_res, rel_path))

    tracked_private = tracked_private_files(repo)
    for path in tracked_private:
        findings.append({"kind": "tracked-private-file", "path": path})

    sensitive_surface = bool(findings)
    reviewers: list[str] = []
    if sensitive_surface:
        reviewers.append("privacy/data-safety")

    payload = {
        "schema_version": SCHEMA_VERSION,
        "status": "sensitive" if sensitive_surface else "clean",
        "repo": "<repo-root>",
        "base_rev": base_rev,
        "config": _display_config_path(repo, config_path),
        "touched_files": touched_files,
        "recommended_reviewers": reviewers,
        "findings": findings,
    }
    return payload


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    base_rev = args.base_rev or args.legacy_base_rev

    try:
        repo = resolve_repo(Path(args.repo_path))
        config_path = None
        if args.config:
            config_path = args.config.expanduser().resolve()
            if not config_path.exists():
                raise ScanError(f"Config path does not exist: {config_path}")
        elif not args.no_config:
            candidate = repo / DEFAULT_CONFIG_NAME
            config_path = candidate if candidate.exists() else None
        payload = scan(repo, base_rev, config_path)
    except ScanError as exc:
        print(f"check_sensitive_surface: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    if args.strict and payload["status"] == "sensitive":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
