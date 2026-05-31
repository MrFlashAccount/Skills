# PersistedRunState context

`PersistedRunState` is the logical aggregate for workflow runner state stored as split files.

## Ownership

- `persisted-state-schema.mjs` owns persisted version/topology, aggregate validation, commit metadata validation, and projection-only helpers.
- `PersistedRunStateReader.mjs` owns physical split-file reads and builds the aggregate candidate before schema validation.
- `PersistedRunStateWriter.mjs` owns the transaction boundary: acquire run-state lock, recover pending journal, validate current aggregate, commit, and verify current aggregate after write.
- `durable-commit.mjs` owns durable journal application/recovery and next-state validation before side effects.
- `atomic-file.mjs`, `lock.mjs`, and `paths.mjs` own the narrow storage primitives used by reader/writer/entrypoints.

## Compatibility surfaces

| Surface | Decision | Owner | Expiry/removal condition | Negative check |
|---|---|---|---|---|
| `persistence/runner/run-state.mjs` | `keep_temporarily` facade-only | `persistence/run-state/**` | delete after remaining non-entrypoint compatibility imports are migrated or public API proof is documented | no entrypoint imports and no active persistence logic in facade |
| `persistence/output-schema-validation.mjs` | `keep_temporarily` facade-only | `schemas/output-schema-validation.mjs` | delete after internal tests/callers import schema owner directly | boundary check rejects duplicate validation definitions |
| `RunStateDTO` | `keep_projection` | DTO/use-case boundary | rename to projection DTO when public import impact is known | persistence/run-state does not use it as storage schema |

`develop/lib/persistence/runner/run-state.mjs` is no longer an active core owner. It re-exports path, lock, atomic-file, and durable-commit owners only for temporary compatibility; entrypoints must import the new owner modules directly.

## Use-case surface classification

| Surface | Decision | Owner/condition | Expiry/check |
|---|---|---|---|
| `RunNext` | keep | public orchestration of workflow + baton + render + host response | entrypoints must not inline transition/render sequencing |
| `ContinueRun` | keep | continuation rendering policy after output application | entrypoints may call public API only |
| `ApplyWorkflowOutput` | keep | worker/approval output application and baton mutation | output validation stays schema-owned |
| `LoadInstructions` | keep | public load-instructions policy over runtime projection + instruction DTO | current-state validation happens before caller reads instruction content |
| `InspectWorkflow` | keep | stable public inspect/read model | no entrypoint import of private runtime helpers |
| `ValidateWorkflow` | public convenience | schema boundary + semantic workflow validator wrapper | keep only while bins/tests use the public surface |
| `use-cases/runtime/**` | private | shared runtime internals for use-cases only | boundary check rejects entrypoint/persistence imports |
| `persistence/runner/run-state.mjs` | facade-only | temporary compatibility re-export | boundary check rejects entrypoint imports |
