# Research packet persistence metadata

Return JSON metadata for the final saved research packet, not the packet markdown body.

## Required saved outcome

When persistence is safe and complete:

```json
{
  "outcome": "saved",
  "saved": {
    "summary": "Short description of the saved approved research packet.",
    "artifact_path": "save_research_packet/artifacts/research-packet.md",
    "history_note": "Optional compact note for run history."
  },
  "artifacts": [
    {
      "id": "research-packet",
      "content_type": "text/markdown",
      "path": "save_research_packet/artifacts/research-packet.md",
      "summary": "Approved research packet."
    }
  ],
  "results": [
    {
      "type": "research_packet_saved",
      "summary": "Approved research packet saved to save_research_packet/artifacts/research-packet.md."
    }
  ]
}
```

## Blocked outcome

When the packet cannot be safely saved:

```json
{
  "outcome": "blocked",
  "blocker": {
    "summary": "Why persistence is unsafe or incomplete.",
    "source_step_id": "save_research_packet",
    "needed": "Concrete missing input or action required.",
    "evidence": ["Relevant state or validation evidence."],
    "risk": "Optional risk note."
  }
}
```

## Template rules

- Do not reproduce the full research packet markdown here.
- Point `saved.artifact_path` and artifact `path` at the saved packet location relative to the current run directory using `<stepId>/artifacts/<artifactId>...`, normally `save_research_packet/artifacts/research-packet.md`.
- Artifact metadata uses `id`, `content_type`, `path`, and optional `summary`; do not emit artifact `type`, `kind`, `producer_step_id`, `version`, `replaces`, aliases, or promotion metadata.
- `ref` is optional/derived; omit it unless the caller explicitly needs a compact display locator.
- Keep summaries short and suitable for baton/history projection.
- Match `workflows/research-critic/schemas/save-research-packet-output.json` exactly.
