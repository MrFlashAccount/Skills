# Research packet persistence metadata

Return JSON metadata for the final saved research packet, not the packet markdown body.

## Required saved outcome

When persistence is safe and complete:

```json
{
  "outcome": "saved",
  "saved": {
    "summary": "Short description of the saved approved research packet.",
    "artifact_path": "outputs/research-packet.md",
    "history_note": "Optional compact note for run history."
  },
  "artifacts": [
    {
      "type": "research_packet",
      "path": "outputs/research-packet.md",
      "summary": "Approved research packet."
    }
  ],
  "results": [
    {
      "type": "research_packet_saved",
      "summary": "Approved research packet saved to outputs/research-packet.md."
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
- Point `saved.artifact_path` and artifact `path` at the saved packet location under the active run directory, normally `outputs/research-packet.md`.
- Keep summaries short and suitable for baton/history projection.
- Match `workflows/research-critic/schemas/save-research-packet-output.json` exactly.
