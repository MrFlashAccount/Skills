# DESIGN.md Contract

Use this file before writing or reviewing `DESIGN.md`.

A usable `DESIGN.md` is not a moodboard in prose. It is an operational design document.

Use `design-terminology.md` for the canonical meaning of design law, product basis, visual direction, constraints, palette, typography, layout, density, motion, hierarchy, and project-class routing.

## Direction synthesis gate

When creating `DESIGN.md` or repairing design law without an explicit chosen visual direction, do not write or update canonical `DESIGN.md` until the reference refinement loop has produced a direction synthesis.

Required before `DESIGN.md` in that path:
- product basis is captured
- Sergey has chosen one option, combined options, rejected all with a new direction, or made another explicit decision
- the chosen direction covers palette, typography, layout, density, shape/radius, motion, and hard-nos, or names an explicit accepted gap for each missing axis
- feedback records liked, rejected, direction constraints, and hard-no items
- synthesis states chosen direction, rejected directions, palette, typography, layout, density, shape/radius, motion, critical hard-no items, and open risks
- write approval exists separately; a direction choice is not file-edit approval unless `implement` was already approved

Forbidden shortcuts:
- treating vague input like `premium dark launcher` as an explicit chosen visual direction
- `DESIGN.md` from taste guesses
- one self-selected palette
- near-duplicate reference options
- copying references instead of extracting design constraints
- one nice option followed by canon
- auto-synthesis after 3 exhausted rounds without Sergey’s explicit decision

## Minimum contents

Before writing durable rules, confirm the product basis is not missing. A `DESIGN.md` needs enough grounded input to state:
- product type, audience, and key surfaces
- primary read/action and trust posture
- intended density and tone
- constraints, hard-nos, and content provenance

When this basis is thin, write the gap into the proposal or ask for it; do not fill it with generic aesthetic assumptions.

A good `DESIGN.md` should cover, as applicable to the scope:

1. visual theme / atmosphere
2. color system / palette roles
3. typography rules
4. spacing / density / rhythm rules
5. layout / composition principles
6. component styling laws
7. interaction / motion philosophy
8. do / don't rules
9. anti-patterns / banned defaults
10. artifact map
11. downstream usage notes
12. handoff notes for tokens, components, states, responsive behavior, accessibility floor, and screenshots/previews when implementation will follow

## Output standard

The document should answer both:
- what the design should feel like
- how a downstream reader should actually use this direction

Downstream usage notes should clarify:
- who uses this design-memory system
- precedence order between `DESIGN.md`, supporting docs, and refs
- how the system should be updated when the design direction changes
- what design hands to frontend: tokens/components/states/responsive/a11y/screenshots; code, profiling, bundle, and performance metrics stay outside design ownership

## Operationality test

A `DESIGN.md` is weak when:
- it speaks only in vibes
- it never becomes concrete about what to do
- it gives no anti-pattern pressure
- it relies on refs to carry the real decisions
- it was written before the required visual-direction synthesis
- it cannot be used without guessing

## Compression rule

Prefer compact, high-signal writing over decorative explanations.
The goal is clarity, not literary atmosphere.

## Split rule

If `DESIGN.md` is becoming bloated, split only the parts that have stable boundaries.
Do not split just to look systematic.
