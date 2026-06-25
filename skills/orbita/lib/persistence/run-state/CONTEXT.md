# Run-state persistence context

`persistence/run-state/**` owns the split-file durable run-state aggregate: paths, locks, atomic writes, durable commits, persisted-state schema, and durable runner host response schema.

Binding rules:

- No compatibility facades outside this folder are approved for run-state read/write.
- API and CLI callers import `PersistedRunStateReader.mjs`, `PersistedRunStateWriter.mjs`, `paths.mjs`, and `lock.mjs` directly.
- This folder must not import DTOs or runtime use-cases. Projection belongs at the entrypoint/use-case boundary.
- Durable `lastResponse` validation stays under `persistence/run-state/schema/**`.
- PR #126 behavior is required: API `next` reads persisted state and projects baton before rendering; continue/load-instructions validate current `lastResponse.requests`, baton/workflow freshness, and committed instruction files before serving host actions.
