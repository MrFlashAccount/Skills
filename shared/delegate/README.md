# Delegate Reference Package

`shared/delegate` is reusable reference material for skills that need delegation behavior.
It is not an installable or runtime skill and intentionally has no `SKILL.md`.

Use it when a workflow skill needs to define how an orchestrator delegates work to workers or subagents, how worker output is merged, or how approvals and scope boundaries are preserved.

Do not use it as a user-facing mode toggle. The old active `delegate` skill has been retired from `skills/`; consuming skills should copy or reference only the pieces they need.

## Package Contents

- [`delegation-contract.md`](delegation-contract.md): reusable principles and worker communication contract.
- [`templates.md`](templates.md): snippets for including the contract in other skills or worker prompts.
- [`delegated-role-task-template.md`](delegated-role-task-template.md): shared prompt template for delegated workers that must load role material.

## Referencing From Skills

From a skill under `skills/<name>/`, refer to this package with skill-root-relative paths:

```markdown
For reusable delegation rules, load `../../shared/delegate/delegation-contract.md`.
For worker prompt snippets, load `../../shared/delegate/templates.md`.
```

If the consuming skill must remain self-contained at runtime, copy the relevant short snippet into that skill instead of creating a hard dependency on this package.

## Boundary

- `skills/` remains the active runtime catalog.
- `shared/delegate` is reference-only material for authoring and reuse.
- This package must not contain `SKILL.md` or be packaged as a skill.
