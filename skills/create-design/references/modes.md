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

Good fits:
- unclear scope
- deciding whether `DESIGN.md` alone is enough
- deciding whether supporting docs are justified

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
