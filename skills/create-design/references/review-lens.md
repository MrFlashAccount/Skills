# Create-Design Review Lens

Use this file during `review` mode, during critic passes in `implement`, and during the final post-implementation review. In create/edit implementation, the required adversarial pass is a separate `Frontend-Taste` attacker/critic after the proposer drafts or edits `DESIGN.md`.

Start from a hostile prior: assume the change, proposal, draft, or packet is wrong, incomplete, overcomplicated, or under-evidenced until the artifact proves otherwise. Do not give credit for intent, author confidence, green self-reports, or plausible-sounding structure. PASS is allowed only after serious attack finds no evidence-backed blocker or important finding. Do not invent issues. Any FAIL must be evidence-backed with file/section or equivalent precise location, and explain why existing checks did not catch it. Prefer small, evidence-backed blockers over broad commentary.

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
