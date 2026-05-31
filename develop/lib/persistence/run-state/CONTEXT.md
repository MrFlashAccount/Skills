# PersistedRunState context

`PersistedRunState` is the logical aggregate for workflow runner state stored as split files.

## Ownership and topology

- Owner: `develop/lib/persistence/run-state/` owns the persisted aggregate contract, current-state reader/schema validation, projection, and writer entrypoint.
- Topology: `split-files-v1` consists of `baton.json`, `.workflow-runner/last-response.json`, `history.md`, `.workflow-runner/instructions/`, and `.workflow-runner/durable-commit.json` as the pending durable journal.
- Writers must serialize run-dir state changes with the run-state lock and validate the aggregate before reporting success.
- Readers must reject invalid current durable journal references instead of projecting unsafe pending state.

## Retained core surface

`develop/lib/persistence/runner/run-state.mjs` remains an active core persistence surface, not a facade-only compatibility wrapper. It owns path resolution, run-state locking, atomic file writes, durable commit recovery, and the low-level commit application path used by the runner.

Status: retained until the low-level durable file primitives and recovery flow are deliberately split into a new persistence owner and all active imports are moved.

Removal condition: remove or demote `persistence/runner/run-state.mjs` only after no entrypoint, writer, CLI, or test imports its active locking/path/recovery/atomic-write contracts and the replacement owner documents the same topology and recovery invariants.
