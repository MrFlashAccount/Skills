# Run-state persistence context

`persistence/run-state/**` owns the split-file durable run-state aggregate: paths, locks, atomic writes, durable commits, and persisted-state schema.

Binding rules:

- No compatibility facades outside this folder are approved for run-state read/write.
- API and CLI callers import `PersistedRunStateReader.mjs`, `PersistedRunStateWriter.mjs`, `paths.mjs`, and `lock.mjs` directly.
- This folder must not import DTOs or runtime use-cases. Projection belongs at the entrypoint/use-case boundary.
- Durable state is baton plus history; current host responses, request lists, and compiled prompts are projections of baton plus the indexed workflow.
- API `next`, `continue`, `write-output`, and `instructions` read persisted baton before rendering; `continue` and `write-output` validate accepted outputs against the freshly rendered current requests, and `instructions` returns the freshly rendered prompt for the current step.
