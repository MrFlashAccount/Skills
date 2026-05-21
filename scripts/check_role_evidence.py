#!/usr/bin/env python3
"""Check canonical final role evidence blocks for role material and parent prompt boundaries."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE_HEADING = "## Final role evidence"
OLD_FIELD = "role_files_loaded"
DELEGATED_ROLE_TEMPLATE = ROOT / "shared" / "delegate" / "delegated-role-task-template.md"
DELEGATED_ROLE_TEMPLATE_REL = "shared/delegate/delegated-role-task-template.md"
PARENT_FORBIDDEN_TERMS = (
    "ROLE_EVIDENCE_LOADED",
    "role_evidence",
    "role evidence",
    "Final role evidence",
    "For final role evidence",
    "named evidence",
    "contract or migration evidence",
    "CONTRACT_OR_MIGRATION_EVIDENCE",
    "evidence that still matters",
    "## Backend implementer phase overlay",
    "Backend implementer phase overlay",
    OLD_FIELD,
)
PARENT_FORBIDDEN_PATTERNS = (
    re.compile(r"ROLE_[A-Z0-9_]*EVIDENCE[A-Z0-9_]*"),
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
ROLE_WRAPPER_SMELLS = (
    "## Shared rules for all roles",
    "For `architect`, bias the prompt toward",
    "Attack the proposal like a responsible principal architect",
    "Pressure-test:\n- hidden coupling",
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


def scan_parent_prompt_boundaries(errors: list[str]) -> None:
    """Prevent parent/orchestrator docs from exposing role-evidence mechanics."""
    scan_roots = [ROOT / "skills", ROOT / "shared" / "delegate"]
    for base in scan_roots:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.md")):
            rel = path.relative_to(ROOT).as_posix()
            text = path.read_text(encoding="utf-8")
            lower = text.lower()
            for term in PARENT_FORBIDDEN_TERMS:
                haystack = text if term.isupper() or term == ROLE_HEADING else lower
                needle = term if term.isupper() or term == ROLE_HEADING else term.lower()
                if needle in haystack:
                    errors.append(f"{rel}: parent/delegation docs must not mention {term!r}")
            for pattern in PARENT_FORBIDDEN_PATTERNS:
                match = pattern.search(text)
                if match:
                    errors.append(f"{rel}: parent/delegation docs must not expose evidence-specific output field {match.group(0)!r}")



def scan_delegated_role_wrapper_smells(errors: list[str]) -> None:
    for rel in DELEGATION_DOCS:
        path = ROOT / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for smell in ROLE_WRAPPER_SMELLS:
            if smell in text:
                errors.append(f"{rel}: contains parent-side role wrapper smell {smell!r}")


def scan_implementer_prompt_compactness(errors: list[str]) -> None:
    rel = "skills/dev-harness/references/roles/implementers.md"
    path = ROOT / rel
    if not path.exists():
        errors.append(f"{rel}: missing implementer role overlay")
        return
    lines = path.read_text(encoding="utf-8").splitlines()
    headings = [(idx, line) for idx, line in enumerate(lines) if line.startswith("## Implementer role:")]
    for role in ("architect", "backend", "frontend"):
        matching = [(idx, line) for idx, line in headings if f"`{role}`" in line]
        if len(matching) != 1:
            errors.append(f"{rel}: expected exactly one compact {role} implementer section")
            continue
        start, _ = matching[0]
        following = [idx for idx, _ in headings if idx > start]
        end = following[0] if following else len(lines)
        section = "\n".join(lines[start:end])
        section_line_count = end - start
        if section_line_count > 25:
            errors.append(f"{rel}: {role} implementer section is too long for compact parent prompt guidance ({section_line_count} lines)")
        if f"Do not paste {role}" not in section and "Do not paste architecture" not in section:
            errors.append(f"{rel}: {role} implementer section must forbid inline role-specific rule walls")
        forbidden_phrases = (
            "Purpose: implement approved durable architecture artifacts",
            "Ownership / file-zone scope:",
            "Must-read / must-load references:",
            "Purpose: own server-side correctness",
            "Purpose: own user-facing implementation quality",
            "Execution rules:",
            "Done criteria / verification expectations:",
        )
        for phrase in forbidden_phrases:
            if phrase in section:
                errors.append(f"{rel}: {role} implementer section contains inlined role-rule phrase {phrase!r}")


def main() -> int:
    errors: list[str] = []

    if not DELEGATED_ROLE_TEMPLATE.exists():
        errors.append(f"{DELEGATED_ROLE_TEMPLATE_REL}: missing shared delegated role task template")
    else:
        template_text = DELEGATED_ROLE_TEMPLATE.read_text(encoding="utf-8")
        if "<role_name>" not in template_text or "<task>" not in template_text:
            errors.append(f"{DELEGATED_ROLE_TEMPLATE_REL}: missing compile-time placeholders")
        if "concrete approved values" not in template_text:
            errors.append(f"{DELEGATED_ROLE_TEMPLATE_REL}: missing placeholder fill policy")
        if "additional, final-answer, or output requirements" not in template_text:
            errors.append(f"{DELEGATED_ROLE_TEMPLATE_REL}: missing neutral role-material output requirement wording")

    scan_parent_prompt_boundaries(errors)
    scan_delegated_role_wrapper_smells(errors)
    scan_implementer_prompt_compactness(errors)

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
        if OLD_FIELD in text:
            errors.append(f"{rel}: contains old {OLD_FIELD!r} field")

    if errors:
        print("Role evidence check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Role evidence check passed: {len(role_files)} role files normalized and parent docs clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
