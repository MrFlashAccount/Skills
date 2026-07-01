# Research packet persistence metadata

Return JSON metadata for the final saved research packet and any approved REASONS research Canvas, not the markdown bodies.

## Required saved outcome

When persistence is safe and complete, return `outcome: saved`, a short `saved.summary`, optional `saved.history_note`, artifact metadata for the saved approved research packet and approved `reasons-canvas-research` artifact when present, and a compact result summary.

## Blocked outcome

When the packet cannot be safely saved, return `outcome: blocked` with a blocker that names why persistence is unsafe or incomplete, the owning source step, the exact missing input/action, and any useful evidence or risk.

## Template rules

- Do not reproduce the full research packet markdown here.
- Return the saved research packet as an artifact when the schema asks for `artifacts`; include the saved `reasons-canvas-research` artifact when present.
- Keep summaries short and suitable for baton/history projection.
- Use the appended output schema for exact JSON shape and artifact field mechanics.
