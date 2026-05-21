#!/usr/bin/env python3
"""Check canonical final role evidence blocks for role material."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_HEADING = "## Final role evidence"
OLD_FIELD = "role_files_loaded"


def canonical_block(repo_relative_path: str) -> str:
    return (
        "## Final role evidence\n\n"
        "When this file is loaded as role material, add this exact path to the final role evidence loaded list:\n\n"
        f"- `{repo_relative_path}`\n\n"
        "Only list this file if it was actually loaded.\n"
    )


def final_block(text: str) -> str | None:
    marker_count = text.count(ROLE_HEADING)
    if marker_count != 1:
        return None
    start = text.index(ROLE_HEADING)
    block = text[start:]
    return block if block.endswith("\n") else block + "\n"


def main() -> int:
    errors: list[str] = []

    role_files = sorted((ROOT / "roles").rglob("*.md"))
    for path in role_files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        count = text.count(ROLE_HEADING)
        if count != 1:
            errors.append(f"{rel}: expected exactly one {ROLE_HEADING!r} block, found {count}")
            continue
        actual = final_block(text)
        expected = canonical_block(rel)
        if actual != expected:
            errors.append(f"{rel}: final role evidence block does not match canonical template")

    skills_dir = ROOT / "skills"
    if skills_dir.exists():
        for path in sorted(skills_dir.rglob("*.md")):
            rel = path.relative_to(ROOT).as_posix()
            text = path.read_text(encoding="utf-8")
            if ROLE_HEADING in text:
                errors.append(f"{rel}: role evidence block is not allowed under skills/")

    for base in (ROOT / "skills", ROOT / "roles"):
        if base.exists():
            for path in sorted(base.rglob("*.md")):
                rel = path.relative_to(ROOT).as_posix()
                if OLD_FIELD in path.read_text(encoding="utf-8"):
                    errors.append(f"{rel}: contains old {OLD_FIELD!r} field")

    if errors:
        print("Role evidence check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Role evidence check passed: {len(role_files)} role files normalized.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
