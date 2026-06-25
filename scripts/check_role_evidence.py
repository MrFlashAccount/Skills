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
    "Compact Frontend-Taste rule wall",
)

CANONICAL_REVIEWER_LABEL_FOLDERS = {
    "frontend taste": "frontend-taste",
    "privacy/data-safety": "privacy-data-safety",
    "qa/reliability": "qa-reliability",
}

REVIEWER_MAPPING_DOCS = (
    "skills/dev-harness/references/roles/reviewers.md",
    "skills/code-review-orchestrator/references/role-prompts.md",
)

CODE_REVIEW_SECTION_HEADINGS = {
    "frontend taste": "Frontend taste",
    "privacy/data-safety": "Privacy / data-safety",
    "qa/reliability": "QA / reliability",
}


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
            if ".workflow-runs" in path.parts:
                continue
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


def markdown_section(text: str, heading: str) -> str | None:
    marker = f"## {heading}"
    start = text.find(marker)
    if start == -1:
        return None
    next_heading = text.find("\n## ", start + len(marker))
    return text[start:] if next_heading == -1 else text[start:next_heading]


def scan_exact_reviewer_role_mappings(errors: list[str]) -> None:
    for rel in REVIEWER_MAPPING_DOCS:
        path = ROOT / rel
        if not path.exists():
            errors.append(f"{rel}: missing reviewer mapping doc")
            continue
        text = path.read_text(encoding="utf-8")
        for label, folder in CANONICAL_REVIEWER_LABEL_FOLDERS.items():
            mapping_line = f"- `{label}` -> `../../roles/{folder}`"
            if mapping_line not in text:
                errors.append(f"{rel}: missing exact canonical mapping {mapping_line}")

            if rel.endswith("dev-harness/references/roles/reviewers.md"):
                section_heading = f"Reviewer role: `{label}` v1"
            else:
                section_heading = CODE_REVIEW_SECTION_HEADINGS[label]
            section = markdown_section(text, section_heading)
            if section is None:
                errors.append(f"{rel}: missing reviewer section for {label!r}")
                continue

            role_path = f"../../roles/{folder}/ROLE.md"
            rubric_path = f"../../roles/{folder}/RUBRIC.md"
            if role_path not in section or rubric_path not in section:
                errors.append(
                    f"{rel}: reviewer label {label!r} must load exact canonical paths "
                    f"`{role_path}` and `{rubric_path}`"
                )

            wrong_candidates = {
                f"../../roles/{label}/ROLE.md",
                f"../../roles/{label}/RUBRIC.md",
                f"../../roles/{label.replace(' ', '-')}/ROLE.md",
                f"../../roles/{label.replace(' ', '-')}/RUBRIC.md",
            } - {role_path, rubric_path}
            for wrong_path in sorted(wrong_candidates):
                if wrong_path in section:
                    errors.append(f"{rel}: reviewer label {label!r} uses non-canonical path `{wrong_path}`")


def scan_reviewer_prompt_compactness(errors: list[str]) -> None:
    rel = "skills/dev-harness/references/roles/reviewers.md"
    path = ROOT / rel
    if not path.exists():
        errors.append(f"{rel}: missing reviewer role overlay")
        return
    lines = path.read_text(encoding="utf-8").splitlines()
    headings = [(idx, line) for idx, line in enumerate(lines) if line.startswith("## Reviewer role:")]
    roles = (
        "architect",
        "critic",
        "backend",
        "frontend",
        "frontend taste",
        "security",
        "privacy/data-safety",
        "qa/reliability",
        "performance",
    )
    for role in roles:
        matching = [(idx, line) for idx, line in headings if f"`{role}`" in line]
        if len(matching) != 1:
            errors.append(f"{rel}: expected exactly one compact {role} reviewer section")
            continue
        start, _ = matching[0]
        following = [idx for idx, _ in headings if idx > start]
        end = following[0] if following else len(lines)
        section = "\n".join(lines[start:end])
        section_line_count = end - start
        if section_line_count > 10:
            errors.append(f"{rel}: {role} reviewer section is too long for compact parent prompt guidance ({section_line_count} lines)")
        if "Load `../../roles/" not in section and "Read repo `DESIGN.md` first" not in section:
            errors.append(f"{rel}: {role} reviewer section must name selected role material path")
        if "follow the loaded role files" not in section and "Follow the loaded role files" not in section:
            errors.append(f"{rel}: {role} reviewer section must defer role rules to loaded role material")
        forbidden_phrases = (
            "- Purpose:",
            "- Focus:",
            "- Must-check questions:",
            "- Must-read / must-load references:",
            "- Non-goals:",
            "- Escalation rules:",
            "- Done criteria:",
            "does the implementation still match",
            "can this be simpler with fewer moving parts",
            "does this preserve or intentionally change the backend contract",
            "is data/loading ownership at the right boundary",
            "does the rendered screen communicate priority clearly",
            "does the slice reveal machine-specific paths",
            "can the touched flow fail, recover, retry",
            "does the change add avoidable work on a hot",
        )
        for phrase in forbidden_phrases:
            if phrase in section:
                errors.append(f"{rel}: {role} reviewer section contains inlined role-rule phrase {phrase!r}")


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
    scan_exact_reviewer_role_mappings(errors)
    scan_reviewer_prompt_compactness(errors)

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
