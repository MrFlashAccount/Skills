# Output Contract

Return one structured wrapper packet. Keep the Researcher packet distinct from wrapper-level findings and verdict.

## Required fields

- `researcher_packet`
- `critic_findings`
- `missing_evidence`
- `unresolved_blockers`
- `verdict`
- `readiness_note`

## `researcher_packet`

Embed the canonical Researcher packet from `roles/researcher/ROLE.md`:

- `summary`
- `domain_vocabulary`
- `goals`
- `non_goals`
- `constraints`
- `known_facts_and_evidence`
- `assumptions`
- `unknowns`
- `decisions_needed`
- `candidate_approaches`
- `readiness_blockers`
- `risks`

Researcher-owned fields must not include critic findings, final verdict, approval language, final structural contract, or implementation entity map.

## Wrapper-level fields

### `critic_findings`
Short findings from the Researcher B attack pass: weak points, unsupported assumptions, over-broad approaches, blocker-classification problems, or hidden risk.

### `missing_evidence`
Facts or verification that would materially improve confidence.

Difference from `unresolved_blockers`:

- `missing_evidence` names absent proof, validation, or facts.
- `unresolved_blockers` names the specific blocking takeaway after judging that missing evidence or ambiguity.

### `unresolved_blockers`
Concise top-level list of unresolved items that currently block approval, architecture handoff, routing, or safe execution-planning start.

Use this for the short scannable stop signs a human or adapter should surface first.

Each item should be brief and direct:

- what is unresolved or blocked
- why it matters now
- who or what must resolve it, if known

### `verdict`
One of:

- `approve_as_is`
- `approve_with_changes`
- `needs_more_research`

### `readiness_note`
A short final recommendation about whether the wrapper is ready to present for human handoff approval to the appropriate downstream owner:

- Architect for architecture-sensitive structural scope
- execution planning when no architecture contract is needed
- more research when blockers remain

## Rules

- All fields must be present, even if some are empty lists.
- Keep the packet structured and adapter-friendly.
- If anything is unresolved enough to block human approval, architecture handoff, routing, or execution-planning start, `unresolved_blockers` must be non-empty.
- Keep `unresolved_blockers` short and highly scannable.
- Do not hide critical blockers inside prose, `critic_findings`, or `missing_evidence` only.
- Do not include final structural contracts, implementation entities, pseudocode, algorithms, edit recipes, exact signatures, command sequences, or patch-like plans.
