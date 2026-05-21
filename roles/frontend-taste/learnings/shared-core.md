# Shared Core

Portable taste canon that should hold across most repos and surfaces.

## Core principles

- hierarchy should be obvious without decorative rescue
- spacing should create structure, not accidental emptiness or density mush
- typography should carry meaning through scale, weight, rhythm, and restraint
- color should support emphasis, not compensate for weak structure
- polish should feel intentional, not ornamental
- visible stability and responsiveness are polish inputs: smooth reading, stable layout, and fast first useful comprehension matter to taste, while metrics and diagnosis stay with Frontend / Performance roles
- UI should look authored, not template-smeared or AI-generic

## Anti-slop heuristics

- prefer structure before effects
- prefer grouping, spacing, and rhythm before adding more containers
- prefer one strong emphasis mechanism over many competing ones
- prefer a controlled neutral base with one intentional accent direction
- prefer believable product states over static happy-path mockups
- prefer visual restraint over fake-premium gloss

## Shared taste expectations

### Typography
- large type should feel confident, not loud for its own sake
- body text should have readable measure and rhythm
- type choices should match the product class instead of defaulting to generic novelty or generic sameness

### Color
- use accent color intentionally, not everywhere at once
- avoid over-saturated accent usage unless the product language explicitly calls for it
- keep palette temperature coherent unless contrast between temperatures is deliberate and controlled

### Layout and composition
- composition should create a clear reading path
- asymmetry is useful when it improves rhythm or emphasis, not as decoration by itself
- repeated equal blocks should justify themselves through clarity, not habit
- cards are a tool, not the default answer to grouping
- default geometry should lean toward softer, more rounded forms rather than hard square corners unless the product language clearly calls for sharper structure
- when rounded geometry is used, prefer superellipse-like rounding over generic pill-or-rectangle defaults when the surface can support that extra polish

### States and polish
- loading, empty, and error states are part of visual quality, not implementation leftovers
- loading, empty, pending, and transition states should preserve the surface rhythm instead of causing flicker, layout jump, or density collapse
- heavy visuals should not block the first useful read; decoration earns its place only after the user can understand what matters
- motion should improve clarity, response, or polish; if it distracts from comprehension, it is probably wrong
- tactile interaction feedback should feel deliberate, not noisy or overproduced

## Review pressure

Ask:
- is the primary action or reading path obvious fast?
- does the surface look intentional at a glance?
- does the first useful read arrive without obvious jank, scroll lag, layout jump, or flicker?
- are density and spacing coherent for the product class?
- is visual polish doing real work, or hiding weak structure?
- do state treatments feel designed, or merely present?

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend-taste/learnings/shared-core.md`

Only list this file if it was actually loaded.
