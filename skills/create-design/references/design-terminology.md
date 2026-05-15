# Design Terminology

Canonical vocabulary for `create-design` and `Frontend-Taste` work. Use these terms instead of vague labels like "premium", "clean", "modern", "Apple-like", or "dashboard vibe" unless the label is decomposed into observable rules.

## `DESIGN.md` / design law

`DESIGN.md` is repo-local design law: the durable source of truth for how the product should look, feel, behave visually, and be judged downstream.

It owns:
- product basis: product type, audience, key surfaces, primary action/read path, trust posture, density, tone, platform constraints, hard-nos
- visual direction: palette, type, layout, shape, density, motion, state treatment, and explicit rejects
- artifact map: supporting docs, refs, and precedence order
- downstream usage: who must read it, when to update it, and what to do when task context conflicts with it

Strong design law:
- names concrete choices and forbidden defaults
- ties choices to product/audience/task reasons
- gives enough palette/type/layout/density/motion/state rules for implementation without taste guessing
- states what is intentionally unresolved
- links supporting docs when the core doc would become bloated

Weak design law:
- speaks mostly in mood words or aesthetic labels
- has no product basis, key action, density, or hard-nos
- lets refs carry the real decision while the doc stays generic
- lists tokens or components without saying how to judge composition and hierarchy

Contradictory design law:
- gives incompatible rules, such as sparse editorial pacing plus dense operator tables with no routing
- conflicts with existing product constraints or screenshots without naming the override
- says to be restrained while requiring spectacle everywhere
- routes to supporting docs that do not exist or disagree with the entrypoint

Routing:
- Missing `DESIGN.md`: do not infer durable product direction from portable taste canon; close product basis and create design law through the calling flow.
- Weak `DESIGN.md`: ask for or synthesize missing product-basis and visual-direction decisions before implementation/review depends on them.
- Contradictory `DESIGN.md`: flag the contradiction, choose the safer local rule only for the current task if required, and route a design-law repair.

## Product basis

Product basis is the minimum factual substrate before visual taste choices become stable.

Required fields:
- product type: dashboard, admin, marketing, docs, app shell, mixed, or explicit other
- audience: public/private, open/closed audience, internal/external, expert/casual, regulated/high-stakes/invite-only if relevant
- key surfaces: the screens or surface classes that define the product experience
- primary action/read path: what must be understood or done first
- trust posture: conservative, operational, premium, playful, experimental, high-stakes, etc.
- density: sparse storytelling, balanced product surface, dense repeat-use utility, data-heavy operations
- tone: emotional posture plus forbidden tones
- platform constraints: viewport, device, browser, design system, framework, accessibility, visible stability constraints, existing UI
- hard-nos: visual, content, interaction, brand, or state treatments that must not appear

Acceptance: a downstream reader can identify what class of product this is, who it serves, what must be obvious first, and what visual defaults are unsafe.

## Visual direction

Visual direction is the chosen, observable design path for the product or surface.

Minimum bar: it covers palette, typography, layout/composition, density, shape/container language, motion, state treatment, and hard-nos; or explicitly marks gaps as unresolved and not safe to infer.

A direction is not specific enough when it only says:
- "minimal", "premium", "futuristic", "SaaS", "editorial", "brutalist", or similar labels
- a color family without roles
- a font name without hierarchy, measure, weight, and density rules
- a layout inspiration without reading path and responsive behavior

Good output shape:
- visual rule: what to do
- product reason: why it fits this audience/task/trust posture
- acceptance signal: how to tell it worked
- rejection signal: what would violate it

## Design constraints

A design constraint is an observable rule that narrows acceptable output.

Constraint classes:
- visual: color roles, contrast, texture, shape, shadow, border, icon style
- layout: grid, alignment, spacing, viewport/chrome, responsive behavior
- content: real vs placeholder content, voice, labels, proof, allowed claims
- state: loading, empty, error, success, permission, degraded data, long content
- motion: duration, easing, trigger, sequencing, reduced-motion alternative
- accessibility: contrast, focus, keyboard path, target size, reduced motion, readable measure
- brand: logo usage, tone, assets, forbidden associations
- visual stability polish: no visible layout jump, flicker, scroll lag, or blocked first useful read; route metrics and root-cause performance diagnosis to Frontend / Performance roles

Acceptance: a reviewer can point to the screen and say whether the constraint is met. If not observable, it is probably a preference, rationale, or implementation note, not a design constraint.

Accessibility constraints should be concise but concrete. Use WCAG-style basics as the external floor for contrast, non-text contrast, keyboard focus, focus visibility, reduced motion, reflow, and target affordance when relevant. Do not bury these behind optional reference-bank material.

## Palette / color system

A palette is a role system, not a bag of attractive colors.

Minimum roles:
- background: page/app foundation
- surface: cards, panels, overlays, raised areas
- text: primary, secondary, muted, disabled
- border/divider: structure without noisy outlines
- accent: one primary emphasis direction, plus allowed intensity range
- focus: visible keyboard/focus state, not just brand color reuse
- semantic states: success, warning, danger, info, pending, disabled

Criteria:
- roles remain readable in real states, not only hero mockups
- accent use is scarce enough to preserve emphasis
- semantic colors are not confused with brand accent
- dark/light surfaces preserve hierarchy and contrast
- color does not compensate for weak structure

Random palette smell: colors are named by aesthetics only, reused inconsistently, or every important thing becomes the accent.

## Typography / type system

A type system defines reading hierarchy and rhythm.

Minimum fields:
- font stack and fallback behavior
- scale: display, title, section, body, caption, data/mono if needed
- weights: which weights carry hierarchy and which are forbidden/noisy
- line height: by text class and density
- line length: readable measure for prose and dense data exceptions
- casing/letter-spacing: especially for labels, nav, tables, buttons
- responsive behavior: what compresses, wraps, truncates, or changes scale

Acceptance: the primary read, secondary read, action, support, and proof can be identified without color or decoration doing all the work.

## Layout system / composition

Layout law defines how surfaces organize attention.

Minimum fields:
- preset layout or composition family: split, shell, feed, table, editor, dashboard grid, docs frame, marketing sequence, etc.
- grid and alignment rules
- spacing scale and rhythm
- reading path: first useful read, secondary scan, action path
- viewport/chrome: nav, sidebars, headers, sticky areas, overlays
- responsive behavior: collapse order, priority, hidden/overflow rules

Acceptance: layout supports the declared primary action/read path and product density. It should not default to bento/cards/three columns unless content structure earns that layout.

## Density

Density is how much information and interaction the surface carries per viewport.

Scale:
- sparse storytelling: low frequency use, persuasion, launch, brand narrative
- balanced product surface: common app pages, clear hierarchy with useful content
- dense repeat-use utility: expert workflows, admin, settings, productivity
- data-heavy operations: monitoring, trading, analytics, incident/ops surfaces

Too sparse signals:
- large empty zones with no comprehension gain
- hero drama delaying the first useful read
- low information per viewport for repeat-use tasks

Too cramped signals:
- weak grouping, tiny type, no scan rhythm
- controls compete with data
- actions or states blur together

Fit signal: density matches task frequency, audience expertise, and consequence of error.

## Motion law

Motion law defines when motion is allowed and what job it performs.

Minimum fields:
- duration range by event type
- easing character: crisp, soft, weighted, mechanical, playful, etc.
- scope: allowed components/states and forbidden decorative motion
- sequencing: whether motion guides reading order or only acknowledges change
- reduced motion: equivalent non-motion state
- allowed moments: load, transition, hover, press, reveal, error, success, reordering

Acceptance: motion clarifies cause/effect, orientation, weight, or polish. It fails when it hides hierarchy, delays comprehension, blocks action, loops without value, or compensates for weak structure.

## Hierarchy / reading order / emphasis

A surface must declare or reveal:
- primary read: what the user must understand first
- secondary read: what supports the primary read
- action: what the user can or should do next
- support: filters, metadata, helper text, navigation
- proof: evidence, counts, state, previews, references, or explanations that build trust

Tests:
- squint test: blurred view still reveals the main structure and action
- first useful read: within the first glance, the user knows what this surface is for
- emphasis budget: one dominant emphasis, a few secondary cues, no equal-weight shouting

## Project type / product class routing

Do not guess the product class from visual taste alone.

Evidence to identify class:
- repo/product description and task brief
- existing `DESIGN.md` product basis
- routes/screens and dominant user jobs
- screenshots/current UI
- audience and workflow frequency
- data density, state complexity, and consequence of mistakes

Routing examples:
- dashboard: overview, metrics, trend/state comprehension, drilldown
- admin: CRUD, permissions, repeat-use operations, safety and reversibility
- marketing: persuasion, narrative sequence, proof, conversion action
- docs: comprehension, navigation, code/content readability, search/findability
- app shell: persistent navigation, workspace continuity, stateful tasks
- mixed: declare which surfaces route to which class; do not flatten into one style

If evidence is missing, state `project class undeclared` and keep class-specific guidance provisional.
