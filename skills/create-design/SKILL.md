---
name: create-design
description: Create, rewrite, review, or materially restructure a project's design-memory system. Use when the task is to author or revise `DESIGN.md`, define a design artifact contract, review existing design docs, split one monolithic design doc into supporting artifacts, or tighten operational design rules such as theme, tokens, spacing, composition, do/don't guidance, and anti-patterns. This skill is for approved design-memory work, including approved review-only passes and approved implementation/rewrite passes.
---

Turn a brief, an existing design doc set, or rough visual direction into a clean, operational design-memory workflow.

Create Design is the process where `Frontend-Taste` acts as the design architect for repo design memory. It is not separate design bureaucracy and it is not frontend implementation/styling work.

## Mode selection

Choose one mode up front:

1. `review`
   - review an existing design-memory system
   - no file edits
   - output findings, gaps, and recommended changes
   - still requires explicit user approval before starting

2. `proposal`
   - shape the design-memory plan
   - define artifact shape, success criteria, and branch handling
   - stop and wait for explicit approval before file edits

3. `implement`
   - create or revise the design-memory files
   - declare whether this is `create` or `edit`
   - run critic/fix iterations, including a separate `Frontend-Taste` attacker/critic pass
   - follow with post-implementation review before calling it done

If the target shape is still fuzzy, use `grill-me` first.
Pre-approval read-only inspection is allowed when needed to understand scope, mode, or the current artifact shape.
Do not turn that inspection into full findings or implementation before approval.
Ask one blocking question at a time.

## Approval gate

This skill is approval-gated for all substantive modes, including review.

- Do not start a review findings pass, proposal execution pass, file drafting, restructuring, or fix loop until the user explicitly says `APPROVED` or `LGTM`.
- Pre-approval work may clarify scope/mode and inspect relevant repo or source material read-only.
- Pre-approval work must not produce the full synthesized review/proposal deliverable.
- Approval for review does not automatically approve implementation.
- If the task moves from review/proposal into edits, stop and get explicit approval for the write phase.

## Default stage model

For non-trivial design-memory work, use this sequence:

1. `source-audit`
   - inspect the brief, existing design docs, refs, and repo context
   - load `roles/frontend-taste/ROLE.md` and `roles/frontend-taste/LEARNINGS.md` when available
   - reduce the task to representative asks
   - identify mode, scope, risks, and missing branches

2. `proposal`
   - use `Frontend-Taste` as the design architect/proposer
   - close the base design-context questions before drafting
   - define success criteria
   - define target artifact shape
   - decide what belongs in `DESIGN.md` vs supporting docs
   - decide whether refs are justified

3. `implement`
   - create or revise the design-memory files
   - keep `DESIGN.md` lean enough to operate
   - keep claimed capabilities aligned with shipped docs

4. `post-implement review`
   - run a separate `Frontend-Taste` attacker/critic pass before completion
   - verify artifact coherence, workflow coherence, and claimed-vs-shipped alignment
   - confirm the edits match the approved proposal
   - do not call the result done until the reviewed output is clean enough

For small approved fixes such as contract-only or wording-only edits, compress the amount of ceremony but keep the same stage boundaries.

## Core rules

- Work from concrete surfaces, briefs, or design docs, not abstract design talk.
- Reduce the task into 3-5 representative asks unless the scope is truly tiny.
- Use `Frontend-Taste` in two distinct roles:
  - proposer/design architect: closes context and drafts or edits `DESIGN.md`
  - attacker/critic: attacks the proposal before implementation is considered done
- The proposer must close these base design-context questions before drafting: product type, audience or closed audience, key action/reading path, requirements and non-goals, trust posture, density, emotional tone, brand assets, screenshots, product context, references, and critical states.
- Keep `DESIGN.md` focused on operational design law, artifact routing, and downstream usage.
- Add supporting docs only when they remove real ambiguity or bloat.
- Do not create extra docs just because a pattern exists in another project.
- Treat refs as support material, not source of truth.
- Do not use this skill for frontend implementation, Figma production, or styling changes unless the task is specifically about design-memory artifacts.
- If the design-memory surface is sensitive, keep repo-visible content redacted/local-safe and run privacy/data-safety review before calling it done.
- After the main edit pass, run critic/fix review loops and then one post-implementation review gate before finalizing.
- If wording is still bloated after the main review/fix loop, run a late-stage compression pass through `forthright` for AI-only design-memory material, then sanity-check that no trigger boundary, artifact rule, or workflow branch was weakened.

## Read next

- Read `references/workflow.md` for the full stage model and branch handling.
- Read `references/modes.md` for `review`, `proposal`, and `implement` expectations, including `create` vs `edit` inside `implement`.
- Read `references/design-artifact-contract.md` before deciding whether supporting docs are justified.
- Read `references/design-md-contract.md` before writing or reviewing `DESIGN.md`.
- Read `references/review-lens.md` before final review and after each review pass.
