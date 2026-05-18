---
name: devrel-copywriter
description: Shape or rewrite repository `readme` framing and opening structure when the file is acting as the product-facing entrypoint to a repo. Use `docs-writer` when the main job is teaching setup, usage, configuration, migration, or API behavior.
---

# Devrel Copywriter

Use this skill as a thin workflow harness for repository `readme` work.

Route first. If the main job is explaining usage, setup, product flow, migration steps, or API behavior, use `docs-writer` instead. In repo `readme` work, this skill owns the product-facing entrypoint, framing, and structure choice. `docs-writer` may be consulted for source-grounding, but it does not own the full repository `readme` rewrite.

Build the writing contract before drafting or restructuring anything.

## Read order

- Read [`../../roles/dev-rel/ROLE.md`](../../roles/dev-rel/ROLE.md).
- Read [`../../roles/dev-rel/RUBRIC.md`](../../roles/dev-rel/RUBRIC.md).
- Start with [references/task-contract.md](references/task-contract.md).
- Read [references/readme-workflow.md](references/readme-workflow.md).
- Read [references/review-policy.md](references/review-policy.md) before the first independent review.

## Routing

- Route repository `readme` requests here when the file is the product-facing entrypoint and needs framing, structure choice, first-screen pitch, or overall message hierarchy.
- Route deep docs, reference, tutorial, migration, API explanation, and README teaching sections whose main job is procedural success to `docs-writer`.
- If the request is only a tiny wording fix inside an already-correct repo `readme`, still keep it here when the edited lines affect framing, positioning, or first-screen comprehension.

## Task class

- `tiny`: a local wording, flow, or emphasis fix that does not change audience, angle, structure, headline, positioning, or claim hierarchy.
- `full-cycle`: a new repository `readme` or any rewrite that changes angle, audience, structure, proof framing, headline, positioning, or claim hierarchy.

If unsure, treat it as `full-cycle`.

## Workflow

- `tiny`: short contract -> edit -> humanizer pass -> one independent review.
- repository `readme` `full-cycle`: contract -> workflow checks from [references/readme-workflow.md](references/readme-workflow.md) -> draft -> DevRel critic attack -> revise -> humanizer pass -> review checkpoint 1 -> fix -> humanizer pass -> review checkpoint 2 -> final checklist.

## Rules

- Treat `../../roles/dev-rel/ROLE.md` and `../../roles/dev-rel/RUBRIC.md` as the general DevRel doctrine for this skill.
- This skill owns the action sequence and process gates for repository `readme` work.
- Use the DevRel role boundary for final quality judgment without deep-linking to DevRel learnings or role-internal references from this skill.
- Run the pre-draft contract/structure attack before writing the full draft.
- Do not invent proof.
- Do not use exact metrics unless confirmed.
- Do not promise roadmap items as current reality.
- Keep developer trust above cleverness.
