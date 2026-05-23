# Role Invocation Template

Use this template when an orchestrator spawns a delegated worker that must act through a specific role. The canonical delegated role prompt shape is [`../delegate/delegated-role-task-template.md`](../delegate/delegated-role-task-template.md); this file is the handoff wrapper that tells the orchestrator what concrete material to inject.

Do not copy role rulebooks into handoff templates. Pass the role invocation below plus the concrete task/handoff packet.

## Orchestrator fill-ins

- Delegated role name: `<role_name>`
- Primary role material path: `<role_file_path>`
- Additional role material paths, if required by the role: `<role_references_or_rubrics>`
- Delegated task / phase: `<implementation | review | fix-pass | other>`
- Source handoff packet: `<implementer-handoff | reviewer-handoff | reviewer-to-implementer-handoff | other>`
- Output contract: `<required output shape>`

## Required injection

When spawning the worker, include all of this in the worker prompt:

1. The shared delegated role task template from [`../delegate/delegated-role-task-template.md`](../delegate/delegated-role-task-template.md), filled with concrete values.
2. The selected role name and primary role material path.
3. Any compact routing/focus guidance that the calling skill requires.
4. The concrete approved handoff packet for the phase.
5. The exact output contract and verification/review expectations.

The worker must load the selected role material before doing the task. If the role material points to rubrics, references, learnings, or other required files, the worker must load those too.

## Filled invocation packet

```md
## Role invocation

Use the shared delegated role task template:
`shared/delegate/delegated-role-task-template.md`

Fill it with:

- role: `<role_name>`
- primary role file: `<role_file_path>`
- delegated task: `<task from the handoff packet>`
- scope: `<scope, constraints, non-goals, and file zones from the handoff packet>`
- output: `<required output contract>`

Also pass:

- source handoff packet: `<path or pasted packet>`
- approved source artifacts: `<research / architecture / implementation plan / review result refs>`
- verification or review expectations: `<checks / rows / verdict fields>`

Do not inline the selected role's full instructions here. The worker loads and follows the role files.
```

## Completion rule

The orchestrator must not treat the worker result as valid when the worker could not load required role material or could not satisfy role-defined output requirements. Mark that handoff `blocked` instead.
