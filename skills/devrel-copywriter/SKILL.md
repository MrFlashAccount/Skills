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
- For a new README or major README rewrite, do not start with a draft or direct edit. Run the README co-design workflow first.
- Route deep docs, reference, tutorial, migration, API explanation, and README teaching sections whose main job is procedural success to `docs-writer`.
- If the request is only a tiny wording fix inside an already-correct repo `readme`, still keep it here when the edited lines affect framing, positioning, or first-screen comprehension.

## Task class

- `tiny`: a local wording, flow, or emphasis fix that does not change audience, angle, structure, headline, positioning, or claim hierarchy.
- `full-cycle`: a new repository `readme` or any rewrite that changes angle, audience, structure, proof framing, headline, positioning, or claim hierarchy.

If unsure, treat it as `full-cycle`.

## Workflow

- `tiny`: short contract -> edit -> humanizer pass -> one independent review. If feasible, the reviewer should not be the author of the current draft/pass.
- repository `readme` `full-cycle`: README co-design workflow first -> contract -> product/audience/proof gate -> proposer framing/structure proposal -> independent pre-draft DevRel critic attack -> short debate/reconciliation -> draft -> independent DevRel critic attack -> synthesizer/editor resolves critique and owns the final draft -> humanizer pass -> review checkpoint 1 -> fix -> humanizer pass -> review checkpoint 2 -> final checklist.

## Rules

- Treat `../../roles/dev-rel/ROLE.md` and `../../roles/dev-rel/RUBRIC.md` as the general DevRel doctrine for this skill.
- This skill owns the action sequence and process gates for repository `readme` work.
- Use the DevRel role boundary for final quality judgment without deep-linking to DevRel learnings or role-internal references from this skill.
- In `full-cycle` README work, do not choose visual direction, structure, or draft until you can state what the product is, who it is for, why it exists, its primary promise, key capabilities, differentiation, first-value path, and the source basis for those claims.
- If the README opening depends on an unfixed logo, hero, or visual direction, stop before drafting or implementation; compare concrete metaphor territories, get human approval, then continue.
- In full-cycle mode, the proposer owns the framing/structure proposal.
- The independent DevRel critic attacks the proposal and later the draft; the critic does not act as a light polisher.
- The synthesizer/editor resolves critique and owns the final draft; do not average proposer and critic output or blindly accept either side.
- Require the quickstart or first-value path to be checked against the repo, source, config, examples, or docs before presenting it as real.
- Run the pre-draft contract/structure attack before writing the full draft.
- No implementation before a human-approved detailed proposal.
- Do not invent proof.
- Do not use exact metrics unless confirmed.
- Do not promise roadmap items as current reality.
- Keep developer trust above cleverness.
