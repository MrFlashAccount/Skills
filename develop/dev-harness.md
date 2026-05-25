# DevHarness Workflow

Minimal inline workflow spec for DevHarness. The orchestrator owns state and passes a baton from one step to the next. Workers receive only the baton plus that step's prompt template; user approval steps pause until explicit approval.

```yaml
workflow:
  name: dev-harness
  version: 0.1

state:
  current_step: research
  baton: {}
  approvals: {}
  artifacts: {}
  history: []

baton:
  task: "original user task"
  constraints: []
  current_artifact: null
  previous_artifact: null
  next_prompt_inputs: {}

rules:
  - Orchestrator keeps state and advances current_step.
  - Workers receive only baton plus the step prompt_template.
  - User approval steps stop until explicit approval.
  - Each step writes its artifact into baton.current_artifact and state.artifacts.
  - No implementation starts before user_approval_plan.

steps:
  research:
    type: subagent
    takes: [baton.task, baton.constraints]
    produces: research_packet
    prompt_template: |
      Research the task using the baton only. Return a compact packet with facts, constraints, risks, open questions, and recommendation.

  user_approval_research:
    type: user_approval
    waits_for: explicit approval of research_packet
    on_approval: move research_packet into baton.previous_artifact; continue to architecture_ab

  architecture_ab:
    type: subagent
    takes: [baton.task, baton.constraints, baton.previous_artifact]
    produces: architecture_packet
    prompt_template: |
      Propose and challenge the minimal architecture for the task. Return the selected approach, rejected alternative, risks, and constraints for planning.

  user_approval_architecture:
    type: user_approval
    waits_for: explicit approval of architecture_packet
    on_approval: move architecture_packet into baton.previous_artifact; continue to implementation_plan

  implementation_plan:
    type: subagent
    takes: [baton.task, baton.constraints, baton.previous_artifact]
    produces: implementation_plan
    prompt_template: |
      Convert the approved research and architecture into a concise implementation handoff. Include scope, files/zones, verification, risks, and rollback.

  user_approval_plan:
    type: user_approval
    waits_for: explicit approval of implementation_plan
    on_approval: move implementation_plan into baton.previous_artifact; continue to implementation

  implementation:
    type: subagent
    via: implementation-harness
    takes: [baton.task, baton.constraints, baton.previous_artifact]
    produces: implementation_artifact
    prompt_template: |
      Implement only the approved plan. Return changed files, verification run, result, and any follow-up needed.

  code_review_loop:
    type: subagent
    via: code-review-orchestrator
    takes: [baton.task, baton.constraints, baton.previous_artifact]
    produces: reviewed_artifact
    prompt_template: |
      Review the implementation against the approved plan. Run the fix/re-review loop if needed and return final verdict, evidence, and remaining risk.

  done:
    type: terminal
    takes: [baton.current_artifact, state.artifacts, state.history]
    produces: final_summary
```
