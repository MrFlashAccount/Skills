# Artifact contract prototype

This is a usage-level prototype only. It updates workflow prompts, templates, and workflow output schema shape enough to test how artifacts feel in DevHarness/research workflows. It does not implement runtime storage or a full Artifact Store.

Runtime note: the aggregate baton schema still has the old artifact `$defs` shape, so applying a new `content_type` artifact through the interpreter currently fails at response/baton validation. That mismatch is intentional for this prototype boundary and should be resolved only when runtime storage/state handling is designed.

## Proposed artifact shape

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
- `path`: run-relative path using `<runDir>/<stepId>/artifacts/<artifactId>...`.

Optional fields:

- `summary`: compact handoff text.
- `ref`: optional/derived compact locator. In the DevHarness prototype it is normally omitted because step id comes from step context and artifact id comes from `id`.

Not included: `type`, `kind`, `producer_step_id`, `version`, `replaces`, aliases, promotion, or final/approved artifact semantics.

## Usage convention

Physical layout:

```text
<runDir>/<stepId>/artifacts/<artifactId>...
```

For DevHarness research approval, the research packet markdown artifact is the human-facing source of truth. The JSON structured output remains the source of truth for workflow branching, state projection, and gates.

A final or approved output does not need promotion. If a final step needs a final output, it creates its own artifact/state output like any other step.

## Open questions

- Should `ref` exist at all, or should consumers derive any display locator from step context + `id` + `path`?
- Should `path` be mandatory for every artifact, or can some future artifact metadata describe externally persisted files? This prototype keeps `path` mandatory because runtime storage is intentionally not implemented.
- Should the schema enforce `path` begins with the current step id? This prototype documents the convention but does not add runtime-aware validation.
