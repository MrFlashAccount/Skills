# UI Engineering Gate

Use this gate when a frontend implementation or review touches user-facing components, routes, forms, stateful widgets, layout behavior, or interaction behavior.

This is an engineering correctness gate. It does not create visual direction, taste doctrine, or new design law. If the issue is hierarchy, composition, brand expression, or screen-level polish, route that judgment to Frontend-Taste. Frontend checks whether the implementation obeys the approved design system and behaves correctly.

## Review shape

For the touched UI, check:
- component boundaries and file locality
- state ownership and async/data flow
- required UI states and recovery paths
- accessibility floor and interaction behavior
- responsive behavior at relevant viewport widths
- design-system/token discipline
- verification evidence

Load focused references only when they match the touched surface:
- `ui-baseline-red-flags.md` for compact PR checks on primitives, destructive actions, mobile viewport traps, forms, data/text presentation, layering, and empty states.
- `interaction-motion-craft.md` for animation, transitions, popovers, press feedback, gestures, reduced motion, and motion-performance behavior.

Escalate a finding when a failure blocks task completion, hides state, breaks keyboard or assistive-technology use, creates duplicated truth, or makes future changes brittle.

## Component boundaries

Prefer small, named seams over one large component that owns every concern.

Strong defaults:
- Colocate component implementation, tests, stories/examples, component-local hooks, and types when repo convention supports it.
- Separate data loading/mutation orchestration from pure presentation when mixing them hides state transitions or contracts.
- Prefer composition over boolean-prop matrices and broad configuration objects.
- Keep shared abstractions earned by repeated use; do not turn one screen's temporary shape into a generic helper.

### 200 LOC pressure rule

A frontend user-facing file or component should aim to stay at or below roughly 200 LOC.

Treat `>200 LOC` as a review trigger, not an automatic failure. The author should provide either:
- an extraction seam, or
- an explicit justification for keeping the file whole.

Common acceptable exceptions:
- generated or schema-like files
- simple route/page composition without complex local logic
- migration slices where splitting would increase risk
- tests, fixtures, or stories where splitting hurts readability

When a component crosses the threshold because it combines data fetching, state transitions, presentation, and event policy, prefer extracting a presentational component, a focused hook, a reducer/state machine, or a child component around a stable concept.

## State placement

Choose the narrowest durable home for state:

- **Local**: component-only UI state.
- **Lifted**: state shared by a small nearby subtree.
- **Context**: mostly-read app/session concerns such as theme, auth identity, locale, permissions, or feature flags.
- **URL**: shareable or restorable view state such as filters, sorting, tabs, pagination, and selected entities when route-safe.
- **Server/cache**: remote data, invalidation, optimistic updates, request lifecycle, and freshness.
- **Global client store**: app-wide client state with real cross-route coordination needs.

Flag duplicated truth, effect-driven synchronization that could be derived during render, prop drilling through components that do not use the value, and global stores used as a convenience drawer.

## Required UI states

For touched surfaces, account for applicable states:
- loading or pending
- empty
- error and retry
- success or confirmation
- focus, hover/press, active, disabled
- permission, partial-data, offline, or degraded states when relevant

Blank screens, inert controls, silent failures, and invisible pending states are frontend correctness bugs, not polish issues.

## Design-system and token discipline

Use existing semantic tokens, component primitives, spacing scale, type scale, radius scale, and state styles before adding new values.

Flag raw colors, arbitrary spacing, one-off shadows, inline style escapes, and local visual rules when the design system already provides a path. If the system has a gap, keep the implementation minimal, name the gap, and route durable visual decisions to the design/design-memory owner.

## Responsive QA

When layout can change, check the touched surface at the repo's relevant breakpoints. If no project breakpoints are known, use 320, 768, 1024, and 1440 CSS px as the default smoke set.

Look for:
- horizontal overflow
- clipped or overlapping content
- broken reading order
- unreachable controls
- weak touch targets
- sticky headers/footers hiding focus or content
- modals, drawers, tables, and side panels that trap, obscure, or overflow on narrow screens

## Verification evidence

Default evidence is build, lint, typecheck, and relevant tests. Add rendered evidence when code affects layout, interaction, accessibility, or responsive behavior:
- screenshots or Storybook/preview checks
- browser smoke test notes
- keyboard walkthrough notes
- axe or equivalent accessibility scan when available
- failing-state reproduction for error, empty, pending, or permission paths

Do not accept tests that merely mount a component when the claim is about behavior, accessibility, or async state transitions.

## Source inspiration

This repo adapts selected ideas from Addy Osmani's `frontend-ui-engineering` skill, especially component architecture, state placement, responsive smoke widths, accessibility, and verification gates, while preserving this repo's role boundary between Frontend and Frontend-Taste: https://github.com/addyosmani/agent-skills/blob/main/skills/frontend-ui-engineering/SKILL.md
