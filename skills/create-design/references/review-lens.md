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

## Typical failures

- vague premium-sounding prose with no rules
- bloated `DESIGN.md` that should have split one stable concern out
- too many supporting docs with no real need
- refs carrying the real direction while the docs stay generic
- no anti-pattern or do/don't guidance
- contradictions between sections written at different times

## Final gate

Do not call the result clean if it still feels like a moodboard pretending to be a system.
