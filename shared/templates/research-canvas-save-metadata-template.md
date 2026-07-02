# Research Canvas persistence metadata

Return JSON metadata for the final saved `reasons-canvas-research` artifact, not the markdown body.

## Required saved outcome

When persistence is safe and complete, return `outcome: saved`, a short `saved.summary`, optional `saved.history_note`, artifact metadata for the saved approved `reasons-canvas-research` artifact, and a compact result summary.

## Blocked outcome

When the Canvas cannot be safely saved, return `outcome: blocked` with a blocker that names why persistence is unsafe or incomplete, the owning source step, the exact missing input/action, and any useful evidence or risk.

## Template rules

- Do not reproduce the full Canvas markdown here.
- Return the saved `reasons-canvas-research` artifact when the schema asks for `artifacts`.
- Keep summaries short and suitable for baton/history projection.
- Use the appended output schema for exact JSON shape and artifact field mechanics.
