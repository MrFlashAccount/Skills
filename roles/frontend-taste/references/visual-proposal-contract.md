# Visual Proposal Contract

Use this when visual direction is unclear, new, high-impact, explicitly requested as stylish/beautiful, or weakly covered by `DESIGN.md`.

A visual proposal gives Sergey real choices before durable design law or implementation depends on taste guesses.

## Required shape

Produce 3-4 variants unless the task explicitly asks for fewer.

Each variant must include:
- name: short working label, not an aesthetic buzzword as rationale
- product fit: product type, audience, trust posture, density, tone
- primary read/action: what becomes obvious first
- palette roles: background, surface, text, muted, border, accent, focus, semantic states
- typography: font stack direction, scale, weights, line height, density fit
- layout/composition: grid, spacing rhythm, viewport/chrome, responsive behavior
- shape/material: radius, borders, shadows/elevation, texture, icon/image treatment
- motion: allowed moments, duration/easing character, reduced-motion rule
- state treatment: loading, empty, error, success, permission/degraded states if relevant
- hard-nos: what this variant must not do
- tradeoff: what it optimizes and what it sacrifices

## Meaningful difference bar

Variants must differ in product-relevant structure, not just color swaps.

Valid differences:
- density and information rhythm
- reading path and layout system
- trust posture and emphasis strategy
- typography voice and hierarchy model
- container/shape/material language
- motion philosophy and interaction feel
- evidence/proof placement

Near-duplicate smells:
- same layout with different accent colors
- same card grid with renamed mood
- typography swaps that do not change hierarchy
- three versions of generic dark SaaS
- options that all rely on the same fashionable cliche

## Sergey decision shape

End the proposal with explicit choices:
- choose one variant
- combine named parts from variants
- reject all and explain what direction to avoid
- approve a follow-up reference scout if evidence is still thin

Do not treat a choice of visual direction as approval for file edits unless the calling workflow already has implementation approval.

## Output template

```md
## Visual proposals

### Option A — <working name>
- Product fit:
- Primary read/action:
- Palette roles:
- Typography:
- Layout/composition:
- Shape/material:
- Motion:
- States:
- Hard-nos:
- Tradeoff:

### Option B — <working name>
...

### Option C — <working name>
...

## Recommendation
- Recommended path:
- Why:
- What I would borrow from other options:
- What remains unresolved:

## Sergey can
- choose:
- combine:
- reject:
- ask for refs:
```

## Acceptance criteria

A good proposal:
- lets Sergey compare real directions without decoding vague taste labels
- makes the product/audience/trust/density assumptions visible
- can be turned into `DESIGN.md` law after approval
- names gaps instead of silently filling them with portable taste defaults
- avoids copying references; it extracts principles only
