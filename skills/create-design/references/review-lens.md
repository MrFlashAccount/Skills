# Create-Design Review Lens

Use this file during `review` mode, during critic passes in `implement`, and during the final post-implementation review. In create/edit implementation, the required adversarial pass is a separate `Frontend-Taste` attacker/critic after the proposer drafts or edits `DESIGN.md`.

## What to check

### 0. Frontend-Taste attacker checks
- Is the product type and audience, including closed/private/internal audience if relevant, explicit enough?
- Are the key action, requirements, constraints, non-goals, trust posture, density, tone, brand/screenshot/product context, references, and critical states closed or marked unanswered?
- Does `DESIGN.md` remain the priority source of truth instead of a moodboard, refs folder, or portable taste defaults?
- Is the direction coherent across product, audience, trust, density, tone, key action, brand, screenshots, and references?
- Were references synthesized into principles and rejected mismatches instead of copied?
- Does the proposal avoid generic/slop risks, aesthetic-label reasoning, fake evidence, and missing states?
- Are contradictions and remaining questions explicit before implementation is considered done?

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
