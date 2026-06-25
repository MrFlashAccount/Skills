# Workflow validation

Validation ownership is split by runtime owner:

- Workflow documents: `./lib/file-contracts/workflow-document-schema.mjs` and `./lib/file-contracts/workflow-document.json`.
- Baton documents: `./lib/entities/Baton/schema/baton-schema.mjs` and `./lib/entities/Baton/schema/baton.json`.
- Generic JSON Schema mechanics: workspace package `schema-validation` under `shared/scripts/schema-validation/**`.
- Runtime output contracts: `./lib/use-cases/runtime/output/schema/**` and `./lib/use-cases/runtime/output/output-schema-validation.mjs`.
- Runtime host response contracts: `./lib/persistence/run-state/schema/**`.
- CLI argument contract: `./lib/entrypoints/cli/schema/**`.

DevHarness workflow-output schemas remain external under `workflows/dev-harness/schemas/**`; tests or DevHarness entrypoints inject them explicitly instead of making `./lib` own them.
