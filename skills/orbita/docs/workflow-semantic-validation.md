# Workflow semantic validation

Canonical validation docs moved to `skills/orbita/lib/validate/workflow-validation.md`.

Canonical validation agent instructions live at `skills/orbita/lib/validate/validation-agent-instructions.md`.

Run the deterministic validator through the existing CLI wrapper:

```sh
node skills/orbita/lib/entrypoints/cli/validate-workflow.mjs workflows/dev-harness/workflow.json
```

or:

```sh
npm run workflow:validate
```
