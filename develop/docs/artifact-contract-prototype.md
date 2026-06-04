# Artifact contract prototype

This is a narrow contract prototype for DevHarness/research workflows. It centralizes low-level artifact mechanics in schema definitions and renderer-generated field notes while keeping workflow step prompts focused on semantic instructions.

It does not implement a full Artifact Store, promotion model, aliases, revisions, or runtime-managed artifact persistence. The prompt builder remains a dumb renderer: it reads templates/schemas, replaces supported placeholders, appends strict generated sections, and does not choose artifact ids, paths, or workflow behavior.

## Central artifact schema shape

The shared baton schema owns artifact metadata under `develop/lib/entities/Baton/schema/baton.json#/$defs/artifact`:

```json
{
  "id": "research-packet",
  "content_type": "text/markdown",
  "path": "research_draft/artifacts/research-packet.md",
  "summary": "Research packet for approval."
}
```

Required fields:

- `id`: artifact id unique within the producer step.
- `content_type`: MIME/content type, for example `text/markdown` or `application/json`.
- `path`: run-relative path using the current step artifact directory convention.

Optional fields:

- `summary`: compact handoff text.
- `ref`: optional/derived compact locator, normally omitted when step id + `id` + `path` are enough.

Not included: `type`, `kind`, `producer_step_id`, `version`, `replaces`, aliases, promotion, or final/approved artifact semantics.

## Producer vs reader usage metadata

Artifact field semantics live with the schema:

- `description`: neutral field meaning.
- `x-use`: producer guidance, rendered near the output schema when a step must emit artifacts.
- `x-read-usage`: reader guidance, rendered near projected baton state when a later step consumes a projected output containing artifacts.

This keeps low-level mechanics out of reusable markdown templates and workflow prompts. A producer sees schema-derived fill notes; a reader sees schema-derived usage notes for projected values.

## Prompt separation rule

Workflow step prompts may say semantic things like:

- create the human-facing research packet as a markdown artifact;
- attack the projected research packet artifact as the approval source of truth;
- show the projected research packet artifact and critic verdict to the user;
- produce architecture decisions from the approved research packet.

Workflow step prompts and markdown templates must not repeat low-level mechanics:

- where to write artifact files on disk;
- how to fill the artifact JSON shape;
- where/how to technically read artifact content;
- standard artifact field semantics.

Those mechanics belong in schema definitions and renderer-generated field notes.

## DevHarness end-to-end flow

1. `research_draft` creates the structured `research_packet` and emits `artifacts[0]` for the human-facing markdown packet, for example `id = research-packet`, `content_type = text/markdown`, `path = research_draft/artifacts/research-packet.md`.
2. `research_attack` projects `research_draft`; renderer-generated reader notes explain artifact metadata semantics. The step prompt only says to attack the projected research packet artifact as the human-facing source of truth and use structured JSON for branching/context.
3. If attack returns `needs_revision`, `research_draft` projects `research_attack`, revises the packet, and emits a fresh artifact for the revised packet using the same central schema contract.
4. `approve_research` projects `research_draft` and `research_attack`; its prompt only says to show the projected research packet artifact plus verdict and wait for explicit approval.
5. On approval, `architecture_draft` projects the approved research state and produces the minimal architecture decision/structural contract required by that approved research. If architecture work is unnecessary, it records the explicit no-artifact decision in `architecture_contract`.

The JSON output remains authoritative for workflow branching, state projection, and gates. The markdown artifact is the human-facing packet for review/approval.

## Open questions

- Should `ref` exist at all, or should consumers derive any display locator from step context + `id` + `path`?
- Should `path` be mandatory for every artifact, or can some future artifact metadata describe externally persisted files? This prototype keeps `path` mandatory because runtime storage is intentionally not implemented.
- Should the schema eventually enforce the current step artifact directory convention, or should that remain renderer/runtime guidance outside JSON Schema?
