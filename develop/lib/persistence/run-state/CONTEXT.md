# Run State Persistence Context

- Canonical workflow state lives strictly in `baton.json`.
- The run index is a lookup/cache/projection aid only; it is never workflow-state authority.
- Host-response snapshot files are not part of the workflow contour; do not add reads, writes, fallbacks, fixtures, or compatibility behavior for them.
- Durable commits may stage baton/history/instruction side effects only.
- API `next` reads persisted state and projects baton before rendering; continue/load-instructions derive current host requests from canonical baton + workflow state.
