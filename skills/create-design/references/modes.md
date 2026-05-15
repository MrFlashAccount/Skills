# Create-Design Modes

## `review`

Use when the task is to inspect a design-memory system and report weaknesses without editing files.

Expected outputs:
- findings
- gaps
- recommended changes
- recommendation to stop, revise proposal, or enter implementation later

Good fits:
- pre-implementation design review
- post-implementation doc quality check
- audit of whether the current design docs are usable downstream

## `proposal`

Use when the target design-memory shape still needs to be planned before edits.

Expected outputs:
- target artifact shape
- mode and branch choice
- success criteria
- review plan
- reference refinement plan when `implement/create` or design-law repair lacks a chosen visual direction

Good fits:
- unclear scope
- deciding whether `DESIGN.md` alone is enough
- deciding whether supporting docs are justified
- deciding whether a visual-direction reference loop is required before create-design can write design law

## `implement`

Use when the write phase is explicitly approved and the skill should create or revise files.

You must declare one subtype:
- `create` -> build a new design-memory system
- `edit` -> revise an existing design-memory system

Expected outputs:
- new or revised `DESIGN.md`
- supporting docs only where needed
- clearer artifact boundaries

Good fits for `create`:
- new product surface
- repo with no design doctrine
- rough brief that needs operational design law

For `implement/create`, if the brief does not already include an explicit visual direction, run the reference refinement loop before writing canonical `DESIGN.md`. The brief is explicit only if palette, typography, layout, density, shape/radius, motion, and hard-nos are each covered or explicitly accepted as gaps; vague labels like `premium dark launcher` are not enough.

Reference loop requirements:
- start from product basis
- present 3 meaningfully different references/directions/options per round
- for each option include: distinct thesis, palette hypothesis, layout model, type/density/shape/motion axes, what to borrow, and what not to copy
- include multiple palette hypotheses
- require Sergey to choose, combine, reject, or continue
- treat the choice as design-direction approval only, not file-edit approval unless `implement` was already approved
- record feedback and hard-no items after each round
- stop after at most 3 rounds; if the third round is exhausted, require Sergey’s explicit decision before synthesis
- synthesize direction before `DESIGN.md`

Good fits for `edit`:
- bloated or vague `DESIGN.md`
- design docs that drifted out of sync
- need to split one monolith into a smaller justified set

## Mode boundaries

- `review` does not include silent edits.
- `proposal` does not include file drafting.
- `implement` requires an explicit approved write phase.
- `implement` must declare `create` or `edit`.
- If the task changes mode midstream, stop and get the correct approval before continuing.
- Proposal/create workflows must not skip from rough taste, vague premium labels, one nice option, or one palette into canonical `DESIGN.md`.
- The reference refinement loop is not for lightweight Frontend-Taste screen review inside an existing stable `DESIGN.md`; it is for create-design design-law creation or repair.
