# Workflow validation

Validation ownership is split by runtime owner:

- Workflow documents: `develop/lib/file-contracts/workflow-document-schema.mjs` and `develop/lib/file-contracts/workflow-document.json`.
- Baton documents: `develop/lib/entities/Baton/schema/baton-schema.mjs` and `develop/lib/entities/Baton/schema/baton.json`.
- Generic JSON Schema mechanics: workspace package `schema-validation` under `shared/scripts/schema-validation/**`.
- Runtime output contracts: `develop/lib/use-cases/runtime/output/schema/**` and `develop/lib/use-cases/runtime/output/output-schema-validation.mjs`.
- Persisted host responses: `develop/lib/persistence/run-state/schema/**`.
- CLI argument contract: `develop/lib/entrypoints/cli/schema/**`.

DevHarness workflow-output schemas remain external under `workflows/dev-harness/schemas/**`; tests or DevHarness entrypoints inject them explicitly instead of making `develop/lib` own them.
