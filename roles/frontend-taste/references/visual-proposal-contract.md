# Visual Proposal Contract

Use this when Frontend-Taste is handling taste-sensitive new screen/design direction that is unclear, new, high-impact, explicitly requested as stylish/beautiful, or weakly covered by `DESIGN.md`.

Do not use this count for create-design reference/direction loops. Create-design uses exactly 3 references/options per round before writing durable design memory.

A visual proposal gives Sergey real choices before durable design law or implementation depends on taste guesses.

## Pre-proposal product-domain gate

Run this gate before producing visual proposals for taste-sensitive UI, new screens, or direction work. It keeps proposals tied to a real product job instead of drifting into generic style options.

Before writing options, name:

- **Human + task verb**: the actual user or operator and the concrete action/read they need, such as `billing admin reconciles failed invoices` rather than `dashboard user`.
- **Domain concepts**: at least **5** real concepts from the product domain, objects, states, metrics, actions, risks, or vocabulary that should shape the interface.
- **Color world**: at least **5** real-world colors, materials, surfaces, instruments, environments, or product-adjacent cues that could inform palette/material choices without copying references.
- **Signature move**: **1** product-specific visual, structural, or interaction element that would make this screen feel authored for this product, not a template.
- **Default replacements**: **3** obvious defaults the proposal will avoid, each paired with a product-specific replacement choice.

Use the gate as proposal input, not as durable design law. If the gate exposes missing product basis, audience, visual direction, palette, typography, layout, density, motion law, constraints, or trust posture that must become stable, route that work to `create-design` instead of silently filling it here.

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
- accessibility floor: contrast, non-text contrast, focus, reflow, and target-affordance risks
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
- passes the pre-proposal product-domain gate before option-writing starts
- lets Sergey compare real directions without decoding vague taste labels
- makes the product/audience/trust/density assumptions visible
- can be turned into `DESIGN.md` law after approval
- names gaps instead of silently filling them with portable taste defaults
- avoids copying references; it extracts principles only

## Source inspiration

This repo adapts selected product-domain and signature-gate ideas from dammyjay93's `interface-design` skill while preserving the repo boundary that Frontend-Taste proposes inside existing design law and does not replace `DESIGN.md` or import memory/system flow: https://www.ui-skills.com/skills/dammyjay93/interface-design/

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend-taste/references/visual-proposal-contract.md`

Only list this file if it was actually loaded.
