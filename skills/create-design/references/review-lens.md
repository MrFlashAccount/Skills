# Create-Design Review Lens

Use this file during `review` mode, during critic passes in `implement`, and during the final post-implementation review.

## What to check

### 1. Doctrine clarity
- Is there a real design law here, or only taste-flavored prose?
- Can a downstream reader tell what the design is trying to enforce?

### 2. Operational value
- Are the rules actionable?
- Does the document say what to do and what not to do?
- Would a strong implementer know how to apply this without guessing too much?

### 3. Internal coherence
- Do palette, typography, spacing, composition, and motion point in the same direction?
- Are there contradictions between restraint and spectacle, density and air, neutrality and expressiveness?

### 4. Artifact boundaries
- Is `DESIGN.md` carrying the right amount of weight?
- Are supporting docs justified?
- Are their boundaries explicit and non-duplicative?

### 5. Anti-pattern pressure
- Are weak defaults or bad habits named clearly enough?
- Does the design-memory system say what to avoid, not just what it likes?

### 6. Downstream usability
- Could `Frontend-Taste`, design review, or implementation use this artifact set without improvising the missing half?
- Is the artifact map explicit enough?

### 7. Reference refinement gate
- When creating or repairing design law without an explicit chosen direction, did the workflow start from product basis before taste?
- If the loop was bypassed, did the direction cover palette, typography, layout, density, shape/radius, motion, and hard-nos, or name explicit accepted gaps for missing axes?
- Did the workflow reject vague labels like `premium dark launcher` as insufficient by themselves?
- Did each round offer exactly 3 references, directions, or options?
- Were the variants meaningfully different instead of near-duplicates?
- Did the variants explore multiple palette hypotheses rather than one self-selected palette?
- Did each option include a distinct thesis, palette hypothesis, layout model, type/density/shape/motion axes, what to borrow, and what not to copy?
- Did Sergey get a clear decision point to choose, combine/mix, reject all, or continue?
- Was feedback recorded as liked, rejected, direction constraints, and hard-no items?
- Did the loop stop at maximum 3 rounds and require Sergey’s explicit decision if exhausted?
- Was direction synthesis completed before `DESIGN.md` was written or updated?
- Was choosing or mixing an option treated as design-direction approval only, not file-edit approval unless `implement` was already approved?
- Did the workflow avoid triggering this loop for lightweight Frontend-Taste screen review inside an existing stable `DESIGN.md`?

## Typical failures

- vague premium-sounding prose with no rules
- bloated `DESIGN.md` that should have split one stable concern out
- too many supporting docs with no real need
- refs carrying the real direction while the docs stay generic
- vague taste labels treated as chosen direction
- `DESIGN.md` written before Sergey chose, mixed, rejected, or explicitly decided a direction
- reference rounds with near-duplicate options, one palette, missing option fields, or one nice option followed by canon
- no anti-pattern or do/don't guidance
- contradictions between sections written at different times

## Final gate

Do not call the result clean if it still feels like a moodboard pretending to be a system.
Do not call create/repair clean if the required reference loop, Sergey decision, stop condition, or direction synthesis gate was skipped.
