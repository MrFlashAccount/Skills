# Workflow semantic validation

Canonical validation docs moved to `./lib/validate/workflow-validation.md`.

Canonical validation agent instructions live at `./lib/validate/validation-agent-instructions.md`.

Run the deterministic validator through the existing CLI wrapper:

```sh
node ./lib/entrypoints/cli/validate-workflow.mjs ../../workflows/dev-harness/workflow.json
```

or:

```sh
npm run workflow:validate
```
