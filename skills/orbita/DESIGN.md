# Orbita Dashboard Design

## Scope

This document defines the design direction for the future read-only Orbita runs
dashboard from GitHub issue #187.

It does not define the visual style for every skill in this repository. It is
scoped to the `orbita dashboard` surface and any supporting run-observation UI.

## Product Basis

Orbita dashboard is an operations surface for watching live `workflow-runner`
and `dev-harness` runs.

Audience:
- expert local users running multiple Codex/Orbita sessions
- closed/private tooling, not a public SaaS product

Primary read:
- what needs attention right now
- which runs are waiting for a human, which are executing worker actions, which
  are blocked, done, or degraded

Primary action:
- inspect a run card
- understand the current host action, current step, workflow provenance, and
  artifacts without mutating run state

Trust posture:
- read-only, operational, compact, and predictable
- no UI affordance may imply that the dashboard can advance, continue, move, or
  repair a run

## Chosen Direction

Use a Trello-like board as the primary model.

Columns are host-action/status buckets, not workflow steps:
- `Waiting for user`
- `Worker running`
- `Blocked`
- `Degraded`
- `Done`

Cards represent current run requests or terminal run records. The board exists
to make attention obvious, not to model the workflow graph.

The workflow graph is secondary. It appears in the run detail drawer after a
card is selected, with the current step highlighted.

Rejected directions:
- graph-first workflow dashboard
- observability wall with charts and panels as the primary surface
- runway/control-tower metaphor
- decorative or themed dashboard chrome
- Jira-like light board styling
- generic dark dashboard palettes without a named color system

## Layout Law

The first viewport is a working board:
- top bar: root/source indicator, filters, search, freshness, and run counts
- main area: horizontally scrollable Kanban lanes
- right side: slide-out detail drawer for the selected card

Column order should optimize attention:
1. `Waiting for user`
2. `Worker running`
3. `Blocked`
4. `Degraded`
5. `Done`

If horizontal space is tight, keep `Waiting for user` and `Worker running`
visible before terminal columns.

Do not put the board inside a decorative card. The board is the surface.

## Card Law

Cards are compact run summaries. They must be readable at scan speed.

Required card content:
- short run title or prompt summary
- run id, shortened but copyable in the detail drawer
- workflow name
- host action/status chip
- current step id
- updated age or last event time
- cursor chips when `baton.cursor` has multiple active branches
- owner/session hint when available

The card title should answer "what is this run about?".
The status chip should answer "what is it waiting on?".
The step id should be secondary provenance, not the headline.

Do not add drag handles, move affordances, primary action buttons, or controls
that resemble `next`, `continue`, `write-output`, `bind-agent`, or retry.

## Detail Drawer

Selecting a card opens a right-side drawer.

The board remains visible while the drawer is open. Opening details must feel
like inspection in context, not navigation away from the board.

The drawer owns details that would overload the card:
- full run id and workflow path/name
- current host action and step
- highlighted workflow mini-map
- current request summary
- artifact links or names
- compact history excerpt
- read/parse/degraded diagnostics when present

The drawer may include copy/open/read-only utility actions, but no execution
actions. If a future command affordance is proposed, it belongs outside this
read-only dashboard contract and requires a separate product decision.

The workflow mini-map inside the drawer is explanatory. It may highlight current
and completed steps, but it must not become the primary navigation model or a
control surface.

Keyboard and focus behavior should match the read-only model:
- selecting a card moves focus into the drawer
- closing the drawer returns focus to the selected card
- `Esc` closes the drawer
- focus states must be visible on cards, filters, and drawer controls

## Visual System

Palette:
- use a high-contrast Catppuccin Mocha-derived dark palette, shifted away from
  blue/cyan and toward warm violet graphite
- the app foundation should match the near-solid background sample `#14131A`
  unless implementation constraints require a close token
- use Catppuccin accents sparingly for chips, focus, selected state, and
  semantic status
- do not flood column backgrounds, cards, or large panels with saturated accent
  color
- avoid a blue cast in large surfaces; blue and cyan must not define the product
  mood

Core tokens:
- app background: `#14131A`
- top bar / drawer: `#191720`
- board column: `#201D29`
- card: `#292632`
- card selected / hover: `#332F40`
- primary text: `#F4F0F7`
- body text: `#F4F0F7`
- metadata text: `#F4F0F7`
- disabled/unavailable text only: `#AFA6BA`
- divider / border: `#4A4357`
- strong divider: `#5C536A`
- focus / selected accent: `#CBA6F7`

State roles:
- waiting for user: `#FAB387` or `#F9E2AF`
- worker running: `#CBA6F7` or `#B4BEFE`, never cyan-first
- blocked: `#F38BA8`
- degraded: `#9A92A8`
- done: `#A6E3A1`

The stock Catppuccin Mocha palette is the color source, but the dashboard uses
warmer foundations, less blue, and brighter text for readability. If tokens are
adjusted later, preserve these relationships:
- page < top bar/drawer < column < card < selected card by brightness
- text must stay clearly above stock Mocha `text` contrast when used on cards
- accents must remain state markers, not decoration
- worker color may be mauve/lavender, but should not make the whole interface
  feel blue

Typography:
- sans-first UI type
- compact labels and chips
- monospace only for run ids, step ids, and file/path-like content
- no oversized hero typography
- do not create hierarchy by lowering text contrast on small text
- card and drawer metadata should use the same readable text color as body text
  unless the value is disabled or unavailable
- separate hierarchy with weight, size, casing, grouping, and position:
  - title: larger or medium weight
  - status chip: colored background/border plus medium weight
  - metadata: smaller size, regular weight, same high-contrast text
  - ids/paths: monospace, smaller size, same high-contrast text

Shape and containers:
- cards and drawer panels use 6-8px radius
- columns use light structure: background tint, border, or divider
- avoid nested cards inside cards
- avoid left-border accent cards as the only hierarchy device; use chip, title,
  timestamp, and column placement together

Density:
- dense repeat-use utility
- avoid marketing spacing, large empty areas, and oversized cards
- keep enough breathing room for cards to be individually scannable

Motion:
- drawer slides in quickly and predictably
- live updates should preserve card position where possible
- use subtle freshness/activity indicators only when they clarify state
- no looping decorative animations
- support reduced motion with static indicators

## Critical States

Loading:
- show board skeleton by column
- do not block the first useful read behind animation

Empty:
- show empty columns explicitly
- distinguish "no runs found" from "root not configured"

Degraded:
- one unreadable run must appear as degraded without crashing or hiding other
  runs
- degraded is observer/read health, not the same as workflow blocked

Blocked:
- blocked is a workflow terminal/problem state
- show blocker summary when available

Done:
- visually subdued
- keep recent done runs discoverable without competing with active work

Parallel cursor:
- show all active cursor branches as chips on the card
- drawer mini-map highlights all active branches

## Hard Nos

- no drag/drop
- no manual column movement
- no runner control buttons
- no chart-first dashboard
- no workflow graph as the primary screen
- no novelty theme, aviation metaphor, or decorative cockpit UI
- no fake metrics or fabricated run data in implementation previews
- no browser-side direct reads from `~/.orbita`; UI consumes safe projections

## Downstream Use

Use this document before designing or reviewing:
- `orbita dashboard`
- run board cards
- host-action lanes
- run detail drawer
- workflow mini-map inside the drawer

Implementation must still follow the architecture contract in
`skills/orbita/ARCHITECTURE.md` when dashboard code is added.
