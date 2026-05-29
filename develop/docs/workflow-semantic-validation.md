# Workflow semantic validation

Canonical validation docs moved to `develop/lib/validate/workflow-validation.md`.

Canonical validation agent instructions live at `develop/lib/validate/validation-agent-instructions.md`.

Run the deterministic validator through the existing CLI wrapper:

```sh
node develop/scripts/validate-workflow.mjs develop/dev-harness.workflow.json
```

or:

```sh
npm run workflow:validate
```
