#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

STALE_AFTER_DAYS = 90
PREFERRED_NAMES = (
    "resume",
    "cv",
    "profile",
    "sergey-profile",
)
PREFERRED_EXTENSIONS = {
    ".md",
    ".txt",
    ".pdf",
    ".doc",
    ".docx",
    ".rtf",
}


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


def candidate_score(path: Path) -> tuple[int, float, str]:
    stem = path.stem.lower()
    name_bonus = 1 if any(token in stem for token in PREFERRED_NAMES) else 0
    return (name_bonus, path.stat().st_mtime, path.name.lower())


def discover_files(search_dir: Path) -> list[CandidateFile]:
    if not search_dir.is_dir():
        return []

    files: list[CandidateFile] = []
    for path in search_dir.iterdir():
        if not path.is_file() or path.name.startswith("."):
            continue
        if path.suffix.lower() not in PREFERRED_EXTENSIONS:
            continue
        files.append(CandidateFile(score=candidate_score(path), path=path))
    return sorted(files, reverse=True)


def isoformat(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def relative_to_skill(skill_dir: Path, path: Path) -> str:
    try:
        return str(path.relative_to(skill_dir))
    except ValueError:
        return path.name


def main() -> int:
    skill_dir, search_dir = resolve_search_dir()
    files = discover_files(search_dir)

    if not files:
        payload = {
            "status": "missing",
            "search_dir": relative_to_skill(skill_dir, search_dir),
            "stale_after_days": STALE_AFTER_DAYS,
            "recommended_action": "ask_for_upload",
            "message": "No local resume/profile file found.",
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    selected = files[0].path
    age_days = int((datetime.now(timezone.utc).timestamp() - selected.stat().st_mtime) // 86400)
    is_stale = age_days > STALE_AFTER_DAYS

    payload = {
        "status": "stale" if is_stale else "fresh",
        "relative_path": relative_to_skill(skill_dir, selected),
        "file_name": selected.name,
        "updated_at": isoformat(selected.stat().st_mtime),
        "age_days": age_days,
        "stale_after_days": STALE_AFTER_DAYS,
        "recommended_action": "ask_to_confirm_update" if is_stale else "read_local_resume",
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
