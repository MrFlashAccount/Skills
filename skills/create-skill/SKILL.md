---
name: create-skill
description: Create, rewrite, audit, or materially restructure a Claude/OpenClaw skill folder from source material or an existing skill. Use when the task is to build a skill from a PDF, SOP, workflow, prompt pack, or notes; review an existing skill like `dev-harness`; tighten trigger metadata/frontmatter; or refactor what belongs in `SKILL.md` vs `references/`/`scripts/`/`assets/`. This skill is for approved skill work, including approved audit-only passes and approved implementation/rewrite passes.
---

Turn source material or an existing skill into a clean source-first skill workflow.

## Mode selection

Choose one mode up front:

1. `audit`
   - review an existing skill
   - no file edits
   - output findings, gaps, and recommended changes
   - still requires explicit user approval before starting

2. `proposal`
   - shape the skill or rewrite plan
   - define structure, trigger surface, success criteria, and branch handling
   - stop and wait for explicit approval before file edits

3. `implement`
   - create or rewrite the skill files
   - run critic/fix iterations
   - follow with post-implementation review before calling it done

If the target shape is still fuzzy, use `grill-me` first.
If the answer can be recovered from the repo or source material, inspect that instead of asking.
Ask one blocking question at a time.

## Approval gate

This skill is approval-gated for all substantive modes, including audit.

- Do not start an audit pass, proposal execution pass, file drafting, restructuring, or fix loop until the user explicitly says `APPROVED` or `LGTM`.
- Pre-approval discussion may only clarify scope/mode or recover missing context.
- Approval for audit does not automatically approve implementation.
- If the task moves from audit/proposal into edits, stop and get explicit approval for the write phase.

## Default stage model

For non-trivial skill work, use this sequence:

1. `source-audit`
   - inspect the source material or existing skill
   - reduce it to representative asks
   - identify mode, scope, risks, and missing branches

2. `proposal`
   - define success criteria
   - define target folder/file shape
   - decide what belongs in `SKILL.md` vs `references/` vs `scripts/` vs `assets/`
   - decide whether a state-machine shape is needed

3. `implement`
   - create or revise the skill files
   - keep `SKILL.md` lean
   - keep claimed capabilities aligned with shipped files/scripts

4. `post-implement review`
   - verify trigger quality, workflow coherence, and claimed-vs-shipped alignment
   - confirm the edits match the approved proposal
   - do not call the skill done until the reviewed result is clean enough

For small approved fixes such as metadata-only or structure-only edits, compress the amount of ceremony but keep the same stage boundaries.

## Core rules

- Work from concrete usage, not abstract summaries.
- Reduce the task into 3-5 representative asks unless the scope is truly tiny.
- Keep `SKILL.md` focused on trigger metadata, default flow, and hard rules.
- Move bulky or variant-specific detail into `references/`.
- Add `scripts/` only for deterministic repeated work.
- Add `assets/` only for output resources.
- If the skill is a sensitive surface, keep repo-visible content redacted/local-safe and run privacy/data-safety review before calling it done.
- For any skill that delegates role-owned workers/subagents, require an explicit Delegated Role Load Contract: parent prompt requirements, worker `ROLE.md`/`RUBRIC.md` load requirements, `role_files_loaded` evidence, and parent rejection rule.
- If the workflow has repeated staged handoffs or unfinished-vs-finished leakage risk, read `references/state-machine-case-study.md` and consider an explicit state machine.
- After the main edit pass, run critic/fix review loops and then one post-implementation review gate before finalizing.
- If wording is still bloated after the main review/fix loop, run a late-stage compression pass through `forthright` for AI-only skill material, then sanity-check that no trigger boundary or safety rule was weakened.

## Read next

- Read `references/workflow.md` for the full stage model and branch handling.
- Read `references/checklist.md` before final review and after each review pass.
- Read `references/testing-and-troubleshooting.md` when checking trigger quality, frontmatter failure modes, or test coverage.
- Read `references/state-machine-case-study.md` when the skill includes iterative review loops, multi-stage handoffs, or leakage risk between unfinished and finished output.
