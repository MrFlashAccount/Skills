# Workflow validation

Validation ownership is split by runtime owner:

- Workflow documents: `skills/orbita/lib/file-contracts/workflow-document-schema.mjs` and `skills/orbita/lib/file-contracts/workflow-document.json`.
- Baton documents: `skills/orbita/lib/entities/Baton/schema/baton-schema.mjs` and `skills/orbita/lib/entities/Baton/schema/baton.json`.
- Generic JSON Schema mechanics: workspace package `schema-validation` under `shared/scripts/schema-validation/**`.
- Runtime output contracts: `skills/orbita/lib/use-cases/runtime/output/schema/**` and `skills/orbita/lib/use-cases/runtime/output/output-schema-validation.mjs`.
- Persisted host responses: `skills/orbita/lib/persistence/run-state/schema/**`.
- CLI argument contract: `skills/orbita/lib/entrypoints/cli/schema/**`.

DevHarness workflow-output schemas remain external under `workflows/dev-harness/schemas/**`; tests or DevHarness entrypoints inject them explicitly instead of making `skills/orbita/lib` own them.
