# Run-state persistence context

`persistence/run-state/**` owns the split-file durable run-state aggregate: paths, locks, atomic writes, durable commits, and persisted-state schema.

Binding rules:

- No compatibility facades outside this folder are approved for run-state read/write.
- API and CLI callers import `PersistedRunStateReader.mjs`, `PersistedRunStateWriter.mjs`, `paths.mjs`, and `lock.mjs` directly.
- This folder must not import DTOs or runtime use-cases. Projection belongs at the entrypoint/use-case boundary.
- Durable state is baton plus history; current host responses, request lists, and compiled prompts are projections of baton plus the indexed workflow.
- API `next`, `continue`, `write-output`, and `instructions` read persisted baton before rendering; `continue` and `write-output` validate accepted outputs against the freshly rendered current requests, and `instructions` returns the freshly rendered prompt for the current step.
- `history.md` is the managed, deterministic, human-facing flight recorder for one run. It records lifecycle/control-flow history, accepted-output summaries, required bounded worker debug-summary side-channel content, terminal outcomes, and safe public failures; it is not a transcript store.
- `write-output` owns accepted-output history entries after output schema validation, artifact path validation, and worker debug-summary side-channel validation. For `run_worker`, accepted-output projection requires the exact generated `--debug-summary-file` path, validates a non-empty regular file, and reads only a bounded prefix; the debug summary is not part of baton/state. Rich debug-summary body ingestion is suppressible and is bounded after normalization to 4 KiB or 80 lines with a truncation marker.
- `continue` owns transition and terminal history, and those history writes must stay atomic with baton transition durability. Retry/recovery must not duplicate, corrupt, or advance misleading history entries ahead of baton state.
- Public command failure history may be appended only when a safe run directory, matching lease context, and managed history path are available. Record only exact relevant public error text after host-safe redaction, bounded after normalization to 2 KiB or 40 lines with a truncation marker. Unsafe or missing context means no history write.
- History must never scrape or persist hidden host transcripts, session registries, private prompts, lease tokens, instruction storage paths, worker lifecycle state, or other host control-plane metadata.
