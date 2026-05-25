# DevHarness Workflow

DevHarness is a compact coordination workflow that turns validated research into approved architecture, an implementation plan, delegated implementation, review, and completion while keeping user approval as the boundary between planning and action.

## Fixed Stages

1. Research
2. User approval
3. Architecture A/B
4. User approval
5. Implementation plan
6. User approval
7. Implementation via implementation-harness
8. Code review loop via code-review-orchestrator
9. Done

## Stage Contract

| Stage | Meaning | Output |
|---|---|---|
| Research | Establish the task facts, constraints, and open risks. | Research packet |
| User approval | User accepts the research packet before structural planning starts. | Approval to continue |
| Architecture A/B | Produce and challenge the structural approach. | Architecture decision |
| User approval | User accepts the architecture decision before execution planning starts. | Approval to continue |
| Implementation plan | Convert the approved direction into a concrete implementation handoff. | Implementation plan |
| User approval | User accepts the implementation plan before code work starts. | Approval to implement |
| Implementation via implementation-harness | Delegate code changes to the implementation harness. | Verified implementation |
| Code review loop via code-review-orchestrator | Review, fix, and re-review until accepted. | Accepted change set |
| Done | Close the workflow after implementation and review pass. | Final result summary |

## Hard Rules

- Each stage produces the artifact consumed by the next stage.
- DevHarness does not implement code.
- Approval gates stop the workflow until the user explicitly approves continuation.
- Stateful execution is added later.
