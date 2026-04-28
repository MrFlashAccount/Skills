#!/usr/bin/env python3
"""Append a short knowledge note to the dev-harness knowledge base."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

KIND_TO_FILE = {
    "fact": "facts.md",
    "lesson": "lessons.md",
    "open-question": "open-questions.md",
}


def _slug_text(text: str) -> str:
    return " ".join(text.split()).strip()


def _append_entry(path: Path, entry: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    if existing and not existing.endswith("\n"):
        existing += "\n"
    if existing and not existing.endswith("\n\n"):
        existing += "\n"
    path.write_text(existing + entry + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=sorted(KIND_TO_FILE))
    parser.add_argument("--title", required=True)
    parser.add_argument("--note", required=True)
    parser.add_argument("--date", default=str(date.today()))
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    target = skill_root / "references" / "knowledge" / KIND_TO_FILE[args.kind]
    title = _slug_text(args.title)
    note = _slug_text(args.note)
    entry = f"- {args.date} — {title}: {note}"
    _append_entry(target, entry)
    print(str(target))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
