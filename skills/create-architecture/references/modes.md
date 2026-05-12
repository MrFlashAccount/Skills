# Create-Architecture Modes

## `audit`

Use when the task is to inspect the current architecture surface and report problems without silently redesigning it.

Expected outputs:
- current-shape findings
- missing artifact list
- friction points
- option pressure notes
- recommendation: stop, scaffold next, or improve next

Good fits:
- architecture review before a rewrite
- checking whether current docs match reality
- finding missing seams, ownership gaps, or dependency drift

## `scaffold`

Use when the repo needs an architecture package or decision path but the right option has not been approved yet.

Expected outputs:
- recovered context
- narrowed architecture options
- recommended direction
- proposal artifact
- explicit stop at approval gate unless implementation is also approved

Good fits:
- greenfield or near-greenfield repo
- repo with no usable `ARCHITECTURE.md`
- ambiguous ask like "help choose the architecture"

## `improve`

Use when the repo already has an architecture shape or package and the task is to evolve it.
This explicitly includes existing-codebase architecture deepening work: improving module shape, interface leverage, seam placement, adapter discipline, and locality without pretending the repo is greenfield.

Default subtype for MVP:
- `align`
  - reconcile docs, seams, ownership, and code reality
  - fix drift before proposing deeper surgery
  - use by default unless the repo clearly needs structural redesign

Other improve cases:
- modularization work
- container/component boundary cleanup
- deepening shallow modules and collapsing pass-through indirection
- adding missing context docs
- splitting an oversized migration into reviewable slices

Improve-mode thinking rules:
- inspect modules in terms of interface, implementation, seam, adapter, depth, leverage, and locality
- use the deletion test to separate real concentration of complexity from pass-through wrappers
- treat the interface as the test surface; avoid proposing designs that only make sense with tests reaching past the interface
- treat one adapter as a hypothetical seam and two adapters as the minimum signal of a real seam
- prefer local `CONTEXT.md` docs as distributed source-of-truth for context placement and ownership rules

Expected outputs after approval:
- revised architecture package
- explicit artifact changes tied to the chosen option
- migration / PR slicing updates

## `align`

Treat this as a focused subtype under `improve`, not as a separate top-level mode for MVP.

Use when:
- the architecture idea is mostly right but poorly documented
- code and docs drifted apart
- ownership, allowed modules, or forbidden dependencies are unclear
- the repo needs architectural tightening, not a full new style

Do not label work `align` if it actually changes the architecture direction materially.
In that case stay in `improve`, narrow options, and run the full approval gate.

## Mode boundaries

- `audit` does not produce canonical architecture artifacts.
- `scaffold` may produce the proposal artifact only; it stops before canonical docs unless implementation is approved.
- `improve` still runs option narrowing and approval when the change is materially architectural.
- `align` is the default gentle path, not a loophole around approval.
- If the task changes mode midstream, stop and get approval for the new scope.
