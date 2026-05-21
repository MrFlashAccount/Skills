#!/usr/bin/env python3
"""Check canonical final role evidence blocks for role material."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_HEADING = "## Final role evidence"
OLD_FIELD = "role_files_loaded"
DELEGATED_ROLE_TEMPLATE = ROOT / "shared" / "delegate" / "delegated-role-task-template.md"
DELEGATED_ROLE_TEMPLATE_REL = "shared/delegate/delegated-role-task-template.md"
TEMPLATE_FORBIDDEN_TERMS = (
    "loaded",
    "role_evidence",
    "role_files_loaded",
    "final role evidence",
    "field names",
    "evidence",
    "envelope",
    "yaml",
    "json",
)
DELEGATION_DOCS = (
    "skills/code-review-orchestrator/SKILL.md",
    "skills/code-review-orchestrator/references/role-prompts.md",
    "skills/create-architecture/references/workflow.md",
    "skills/create-design/references/workflow.md",
    "skills/create-skill/references/workflow.md",
    "skills/dev-harness/SKILL.md",
    "skills/dev-harness/references/roles/implementers.md",
    "skills/dev-harness/references/roles/reviewers.md",
    "skills/dev-harness/references/task-contract.md",
    "skills/implementation-harness/SKILL.md",
    "skills/implementation-harness/references/workflow.md",
)
DUPLICATED_DELEGATION_SNIPPETS = (
    "load selected role material;\n- follow all instructions in loaded role material;",
    "require the worker to load the selected role material before",
    "The worker must follow all instructions in loaded role material",
    "Each worker must follow all instructions in loaded role material",
)


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

    if not DELEGATED_ROLE_TEMPLATE.exists():
        errors.append(f"{DELEGATED_ROLE_TEMPLATE_REL}: missing shared delegated role task template")
    else:
        template_text = DELEGATED_ROLE_TEMPLATE.read_text(encoding="utf-8")
        template_lower = template_text.lower()
        for term in TEMPLATE_FORBIDDEN_TERMS:
            if term in template_lower:
                errors.append(f"{DELEGATED_ROLE_TEMPLATE_REL}: contains forbidden delegation-template term {term!r}")

    for rel in DELEGATION_DOCS:
        path = ROOT / rel
        if not path.exists():
            errors.append(f"{rel}: missing delegation doc")
            continue
        text = path.read_text(encoding="utf-8")
        if "delegated-role-task-template.md" not in text:
            errors.append(f"{rel}: does not reference shared delegated role task template")
        for snippet in DUPLICATED_DELEGATION_SNIPPETS:
            if snippet in text:
                errors.append(f"{rel}: duplicates delegated role task instructions instead of referencing shared template")

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
