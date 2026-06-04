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

Optional fields:

- `path`: run-relative path. Current local artifacts conventionally use `<stepId>/artifacts/<artifactId>...` under the run directory.
- `summary`: compact handoff text.

Not included: `type`, `kind`, `producer_step_id`, `version`, `replaces`, aliases, promotion, or final/approved artifact semantics.

## Artifact usage metadata

Artifact field semantics live with the schema using the existing metadata style only:

- `description`: neutral field meaning.
- `x-usage`: producer/reader usage guidance rendered as schema-derived field notes.

This keeps low-level mechanics out of reusable markdown templates and workflow prompts. A producer sees schema-derived fill notes; a reader sees schema-derived usage notes for projected values from the same central metadata.

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

1. `research_draft` creates the structured `research_packet` and emits `artifacts[0]` for the full human-facing markdown packet, for example:

   ```json
   {
     "id": "research-packet",
     "content_type": "text/markdown",
     "path": "research_draft/artifacts/research-packet.md",
     "summary": "Research packet for approval."
   }
   ```

2. `research_attack` reads artifact `research-packet` from `research_draft` and reviews/attacks that artifact; structured JSON remains branching/context metadata.
3. If attack returns `needs_revision`, `research_draft` projects `research_attack`, revises the packet, and emits a fresh artifact for the revised packet using the same central schema contract.
4. `approve_research` presents artifact `research-packet` from `research_draft` plus `research_attack.verdict` and waits for explicit human approval.
5. On approval, `architecture_draft` uses the approved/current `research-packet` artifact from `research_draft` as the research source of truth and produces the minimal architecture decision/structural contract required by that approved research. If architecture work is unnecessary, it records the explicit no-artifact decision in `architecture_contract`.

The JSON output remains authoritative for workflow branching, state projection, and gates. The markdown artifact is the human-facing packet for review/approval.

## Open questions

- Should `path` remain emitted by prototype workers, or should a later runtime derive local artifact paths from step id and artifact id?
- Should the schema eventually enforce the current step artifact directory convention, or should that remain renderer/runtime guidance outside JSON Schema?
