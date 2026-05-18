---
name: docs-writer
description: Write or rewrite library and product documentation for usage, setup, onboarding flow, migration, examples, API explanation, and reference clarity. Use when the main job is helping readers succeed quickly and correctly through better docs structure, sequencing, and explanation, including README sections that teach setup, usage, configuration, or onboarding. Do not use for framing, positioning, README openings, launch copy, or polish-first devrel messaging; use devrel-copywriter for narrative framing and polish.
---

# Docs Writer

Start contract-first. Before editing, define the artifact, reader, first win, doc mode, source of truth, scope, prerequisites, and risks with [references/task-contract.md](references/task-contract.md).

## Routing boundary

Use this skill when the job is documentation teaching:
- usage or setup
- quick starts, tutorials, how-tos, and onboarding flow
- migration docs
- API behavior, options, examples, or reference clarity
- README sections whose main job is teaching install, configuration, usage, or first success

Do not use this skill when the main job is messaging:
- framing or positioning
- README openings, hero copy, or narrative framing
- polish-first rewrites where the teaching structure is already fine
- launch copy, changelog blurbs, or marketing-leaning narrative

For those, use `devrel-copywriter`.
A full repository `readme` rewrite or product-facing repo `readme` entrypoint remains DevRel-owned even when `docs-writer` is consulted for source-grounding or deeper sections.

## Read order

1. Classify the task.
2. Read [`../../roles/tech-writer/ROLE.md`](../../roles/tech-writer/ROLE.md).
3. Read [`../../roles/tech-writer/RUBRIC.md`](../../roles/tech-writer/RUBRIC.md).
4. Read [references/task-contract.md](references/task-contract.md).
5. If `full-cycle`, read [references/doc-modes.md](references/doc-modes.md) before locking the contract.
6. If `tiny`, still name the current or target doc mode in the contract; read [references/doc-modes.md](references/doc-modes.md) too if the mode is not obvious.
7. Read [references/review-policy.md](references/review-policy.md) before the first independent review.

## Task class

- `tiny`: local clarity fix, one option or field, one narrow patch, or similar edit that does not change the teaching flow or primary doc mode.
- `full-cycle`: any change to the first-win path, concept order, section structure, primary doc mode, or onboarding flow.

If unsure, treat it as `full-cycle`.

## Workflow

### Tiny

1. Write a compact contract, including doc mode and source of truth.
2. Confirm the patch preserves that mode.
3. Edit.
4. Run one independent review.

### Full-cycle

1. Read [references/doc-modes.md](references/doc-modes.md) and write the contract with one primary doc mode.
2. Critique the teaching plan against that mode.
3. Run a short debate.
4. Draft.
5. Review checkpoint 1.
6. Fix.
7. Review checkpoint 2.

## Execution notes

### Contract

Capture only the facts needed to teach clearly. Even for tiny work, record the doc mode and source of truth. Ask for the smallest missing blocker.

### Doc mode

Keep doc mode inside the contract. For tiny edits, confirm the existing mode stays intact. For full-cycle work, choose one primary mode early and keep the structure honest. Do not drift into tutorial, reference, and explanation at the same time by accident.

### Critique

Attack hidden setup, bad concept order, premature API surface, jargon before meaning, and examples that would fail for a cold reader.

### Debate

Use one short `techwriter` vs `critic` round only when it helps choose the clearest path. Load `../../roles/critic/ROLE.md` for the critic side; this skill supplies the documentation-stage wrapper.

### Review

Apply the review policy after writing, not just at the end. For `full-cycle` work, checkpoint 2 should confirm the fixes actually cleaned up the first review findings.

## Rules

- Treat `../../roles/tech-writer/ROLE.md` as the canonical writing/review identity for documentation work; this skill supplies the docs-stage workflow and contracts.
- Optimize for low confusion and fast first success.
- Prefer teaching over impressing.
- Do not hide prerequisites or glue code.
- Do not let onboarding turn into full reference.
- Treat README teaching sections as docs work; treat README framing and polish as messaging work.
- Do not claim ownership of the full product-facing repository `readme`; that entrypoint belongs to `devrel-copywriter`.
- Prefer one strong example over many weak ones.
- Keep style polish optional and subordinate to clarity.
