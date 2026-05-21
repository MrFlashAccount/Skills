# Project Routing

Use this before applying project-class taste guidance. `DESIGN.md` or equivalent repo design memory has priority over portable defaults.

## DESIGN.md-first behavior

1. Look for repo-local `DESIGN.md` or equivalent design contract.
2. If present, read it before portable role learnings.
3. Treat it as local law unless it is missing, weak, or contradictory.
4. Load only the project-class learning files it routes to.
5. If task context conflicts with `DESIGN.md`, flag the conflict instead of silently overriding local law.

When `DESIGN.md` is absent:
- do not guess durable direction from taste canon
- close the product basis first
- state that project class is undeclared
- keep class-specific guidance provisional

When `DESIGN.md` is weak:
- identify missing basis fields: product type, audience, key surfaces, primary action/read path, trust, density, tone, constraints, hard-nos
- ask or route to design-law repair before relying on those fields

When `DESIGN.md` is contradictory:
- name the contradiction precisely
- avoid broad redesign from portable taste preferences
- use the safest explicit local rule for the current slice only if action cannot wait
- route the durable fix back to the design-memory workflow

## Product class evidence

Use evidence, not vibe.

Strong evidence:
- explicit `DESIGN.md` product type or artifact routing
- product brief, README, route names, screenshots, shipped UI
- dominant user jobs and frequency
- audience type and trust/consequence level
- data density, workflow repetition, state complexity
- task acceptance criteria

Weak evidence:
- color palette alone
- fashionable layout style
- one isolated component
- repository framework
- generic words like portal, platform, tool, studio, cockpit, AI

## Routing classes

### Dashboard

Use when the surface is primarily about overview, status, metrics, trends, monitoring, or drilldown.

Taste pressure:
- first useful read before decorative hero
- chart/table hierarchy and annotation clarity
- density appropriate to refresh frequency
- restrained accents for status and anomalies

### Admin panel

Use when users manage records, permissions, settings, CRUD, moderation, billing, or operational controls.

Taste pressure:
- clarity, reversibility, state visibility, and safe actions
- dense repeat-use utility without mush
- obvious destructive/permission boundaries
- boring can be good; vague premium drama is usually wrong

### Marketing site

Use when the surface persuades, explains value, builds trust, or drives conversion.

Taste pressure:
- narrative sequence and proof
- strong first read and conversion path
- authored pacing, not equal-card filler
- real evidence over fake metrics/testimonials

### Docs site

Use when the surface teaches, documents, or helps users find answers.

Taste pressure:
- readability, search/findability, navigation, code/prose rhythm
- stable layout and anchors
- restrained brand expression behind comprehension
- examples and state clarity over visual spectacle

### App shell

Use when persistent navigation, workspace continuity, and stateful tasks define the experience.

Taste pressure:
- orientation, current location, task continuity
- chrome that supports work without stealing attention
- responsive behavior for nav, panels, overlays
- state and notification hierarchy

### Mixed product

Use when different surfaces have different jobs, such as marketing + app shell + dashboard.

Rule:
- route by surface, not by one global aesthetic label
- declare which class owns each key surface
- keep shared brand/tokens coherent while allowing density/layout differences

## Routing output template

```md
- DESIGN.md status: present / missing / weak / contradictory
- Product class: dashboard / admin / marketing / docs / app shell / mixed / undeclared
- Evidence:
- Loaded portable guidance:
- Provisional assumptions:
- Must not infer:
- Required design-law repair, if any:
```

## Acceptance criteria

Routing is good when:
- a reader can see why the class was chosen
- missing evidence is explicit
- portable guidance does not override local design law
- mixed products are split by surface instead of flattened
- class-specific advice is not applied when class evidence is weak

## Final role evidence

When this file is loaded as role material, add this exact path to the final role evidence loaded list:

- `roles/frontend-taste/references/project-routing.md`

Only list this file if it was actually loaded.
