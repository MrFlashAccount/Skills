# Frontend Taste Quality Criteria

Use this as a concrete review checklist for rendered screens, design drafts, and visual proposals. It complements `../learnings/shared-core.md` and links to anti-pattern files instead of duplicating every banned pattern.

## Hierarchy and reading order

Passes when:
- primary read is obvious within the first glance
- secondary read supports rather than competes
- main action is visible and proportionate to its importance
- support/proof information is discoverable without shouting
- squint test still reveals the intended structure

Fails when:
- everything has equal weight
- color is the only hierarchy tool
- decorative elements win over task comprehension
- the user must inspect the whole screen before knowing what matters

## Density fit

Passes when:
- information per viewport matches task frequency and audience expertise
- spacing creates grouping, not accidental emptiness
- dense regions still have rhythm, alignment, and scan lanes
- sparse regions earn their air through narrative or focus

Fails when:
- repeat-use/admin/data surfaces become portfolio-empty
- marketing/docs pages become cramped utility grids
- tables, filters, and actions collapse into visual mush
- large hero or bento areas delay first useful read

## Polish and finish

Passes when:
- alignment, spacing, type, color, borders, radius, and states feel authored together
- empty/loading/error/success states preserve rhythm and tone
- controls have clear affordance, focus, hover/press, disabled, and active states
- edge cases such as long text, missing data, and narrow viewports are visually handled

Fails when:
- the happy path is styled but states are raw
- shadows/borders/radii are inconsistent without purpose
- spacing almost aligns but keeps feeling accidental
- content overflows, jitters, or collapses under normal data

## Accessibility floor

Use WCAG-style basics as a visual-quality floor, not as optional polish.

Passes when:
- text contrast is strong enough for readable hierarchy in real states
- non-text contrast keeps controls, focus indicators, dividers, charts/icons, and semantic states perceivable
- focus states are visible, coherent with the palette, and not hidden behind sticky chrome or overlays
- keyboard/focus order is visually understandable on interactive surfaces
- reduced-motion mode preserves meaning without relying on animation
- zoom, reflow, and narrow viewport behavior preserve reading order and avoid clipped content
- important targets look interactive and reachable, especially on touch surfaces

Fails when:
- brand color, low-contrast subtlety, or glass/blur effects make content or controls hard to perceive
- focus is missing, barely visible, or visually disconnected from the active control
- motion carries meaning without a non-motion equivalent
- responsive compression breaks the intended read/action path

## Authored / intentional test

A surface feels authored when:
- there is a visible design law behind repeated choices
- components relate to each other through shared rhythm and hierarchy
- constraints are chosen, not merely inherited from defaults
- visual restraint has product reason, not fear of design

It feels accidental when:
- defaults from the framework are still visible as the main style
- every section solves hierarchy differently
- trendy effects appear without product job
- placeholders, fake metrics, or generic illustrations pretend to be real evidence

## Generic / cliche detector

This is a local Frontend-Taste heuristic, not universal design law. Use it as pressure unless `DESIGN.md` gives a concrete product reason.

Flag by default:
- aesthetic labels used as rationale without operational rules
- generic AI/SaaS gradients, glow, glass, bento, equal-card rows, fake metrics, fake quotes
- emoji/icon crutches replacing structure
- left-border accent cards as default hierarchy
- custom cursors, decorative loops, or spectacle motion without product job

For the hard list, use `../learnings/anti-patterns.md`. For softer smells and examples, use `../learnings/bad-smells.md` and `../learnings/examples.md`.

## Visible stability / latency symptoms

Presentation quality includes visible stability and responsiveness symptoms, but Frontend Taste does not own CLS, INP, Core Web Vitals, profiling, bundle cost, or root-cause performance diagnosis. Route metric ownership and fixes to Frontend / Performance roles.

Severity:
- blocker: first useful read is blocked, major layout shift, obvious loading flicker, scroll unusable, interaction feedback misleading
- high: repeated jank, delayed key action, skeleton/loaded layout mismatch, animations slow comprehension
- medium: localized flicker, minor shift, hover/press lag, heavy decoration distracts under normal use
- low: small polish issue that does not affect comprehension or action

Passes when:
- first useful read appears quickly and remains stable
- transitions preserve orientation
- loading/empty/degraded states maintain layout rhythm
- motion and media do not steal priority from comprehension

## Design-to-frontend handoff checklist

Use this only when a design direction or `DESIGN.md` is expected to feed implementation. This is a handoff completeness check, not Frontend-Taste taking ownership of code or performance metrics.

Passes when `DESIGN.md` or its supporting docs define enough for frontend to implement without guessing:
- tokens: color roles, type scale, spacing/rhythm, radius, borders/elevation, focus and semantic state colors
- components: core component styling laws, variants, density behavior, and forbidden defaults
- states: loading, empty, error, success, disabled, active, hover/press, focus, degraded/permission states as relevant
- responsive: key breakpoints or behavior rules, reflow order, narrow viewport constraints, and overflow expectations
- a11y: contrast/non-text contrast, visible focus, keyboard-visible path, reduced-motion rule, target affordance
- screenshots/previews: current surfaces, approved direction, or expected visual references when available; Figma is useful when present but not mandatory

Ownership boundary:
- design law hands off `DESIGN.md -> tokens/components/states/responsive/a11y/screenshots`
- frontend implementation owns code translation, framework details, profiling, bundle cost, CLS, INP, Core Web Vitals, and root-cause performance fixes

## Acceptance checklist

Before calling a surface visually good, answer:
- What is the primary read?
- What is the main action?
- What density level is this using, and why?
- What visual law explains palette, type, spacing, shape, and motion?
- Which accessibility floor checks matter for this surface?
- Which state or edge case would most likely break the polish?
- Which generic/cliche pattern was avoided or intentionally justified by `DESIGN.md`?
