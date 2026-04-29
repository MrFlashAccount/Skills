#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

STALE_AFTER_DAYS = 90
SUPPORTED_EXTENSIONS = {".md", ".txt"}
PREFERRED_NAMES = (
    "resume",
    "cv",
    "profile",
    "sergey-profile",
)


@dataclass(order=True)
class CandidateFile:
    score: tuple[int, float, str]
    path: Path


def resolve_search_dir() -> tuple[Path, Path]:
    skill_dir = Path(__file__).resolve().parents[1]
    if len(sys.argv) > 1:
        search_dir = Path(sys.argv[1]).expanduser().resolve()
    else:
        search_dir = (skill_dir / "private").resolve()
    return skill_dir, search_dir


def relative_to_skill(skill_dir: Path, path: Path) -> str:
    try:
        return str(path.relative_to(skill_dir))
    except ValueError:
        return path.name


def isoformat(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def age_days_for(path: Path) -> int:
    return int((datetime.now(timezone.utc).timestamp() - path.stat().st_mtime) // 86400)


def candidate_score(path: Path) -> tuple[int, float, str]:
    stem = path.stem.lower()
    exact_bonus = 1 if stem in PREFERRED_NAMES else 0
    partial_bonus = 1 if any(token in stem for token in PREFERRED_NAMES) else 0
    return (exact_bonus + partial_bonus, path.stat().st_mtime, path.name.lower())


def discover_files(search_dir: Path) -> list[CandidateFile]:
    if not search_dir.is_dir():
        return []

    files: list[CandidateFile] = []
    for path in search_dir.iterdir():
        if not path.is_file() or path.name.startswith("."):
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        files.append(CandidateFile(score=candidate_score(path), path=path))
    return sorted(files, reverse=True)


def file_payload(skill_dir: Path, path: Path) -> dict[str, object]:
    return {
        "relative_path": relative_to_skill(skill_dir, path),
        "file_name": path.name,
        "updated_at": isoformat(path.stat().st_mtime),
        "age_days": age_days_for(path),
    }


def main() -> int:
    skill_dir, search_dir = resolve_search_dir()
    files = discover_files(search_dir)

    if not files:
        payload = {
            "status": "missing",
            "search_dir": relative_to_skill(skill_dir, search_dir),
            "supported_extensions": sorted(SUPPORTED_EXTENSIONS),
            "stale_after_days": STALE_AFTER_DAYS,
            "recommended_action": "ask_for_upload",
            "message": "No local markdown or text resume/profile file found.",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if len(files) > 1:
        payload = {
            "status": "ambiguous",
            "search_dir": relative_to_skill(skill_dir, search_dir),
            "supported_extensions": sorted(SUPPORTED_EXTENSIONS),
            "stale_after_days": STALE_AFTER_DAYS,
            "recommended_action": "ask_user_to_choose",
            "candidates": [file_payload(skill_dir, candidate.path) for candidate in files[:10]],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    selected = files[0].path
    payload = file_payload(skill_dir, selected)
    payload["stale_after_days"] = STALE_AFTER_DAYS

    if payload["age_days"] > STALE_AFTER_DAYS:
        payload["status"] = "stale"
        payload["recommended_action"] = "ask_to_confirm_update"
    else:
        payload["status"] = "fresh"
        payload["recommended_action"] = "read_local_resume"

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
