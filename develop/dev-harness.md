# DevHarness Workflow

DevHarness is a draft workflow model for staged work with explicit approvals. The worker never sees the workflow graph, baton, current node, or allowed transitions. It receives only a generated prompt assembled by the orchestrator and returns `worker_output` for the current step.

No runner code exists yet; this document records the intended boundary.

## Model

- The orchestrator owns workflow state, prompt assembly, and calls to the transition helper.
- A worker prompt is generated from:
  - shared template / role template
  - step prompt
  - injected artifacts
  - constraints
  - expected output format
- The workflow graph is a finite state machine: steps, allowed outcomes, and the next step for each outcome.
- The baton is only state and recovery data: current step, artifacts, approvals, status or blocker, and history.
- The transition helper receives `workflow`, `baton`, and `worker_output`; it validates the result and returns `transition_result`.
- Workers return only their requested artifact/status. They do not choose `next`, update `currentStep`, or advance any global node.

## Fixed workflow

1. Research clarifies facts, constraints, risks, and open questions.
2. Sergey approves the research packet.
3. Architecture proposes the minimal approach and rejected alternative.
4. Sergey approves the architecture packet.
5. Implementation planning turns the approved context into a handoff.
6. Sergey approves the implementation plan.
7. Implementation makes only the approved changes.
8. Review checks the result against the approved plan and returns the final verdict.

## Prompt boundary

Workers are isolated from orchestration state. For each worker step, the orchestrator generates a prompt that contains only the material needed for that step:

```yaml
worker_prompt:
  shared_template: "common worker contract"
  role_template: "research | architecture | planning | implementation | review"
  step_prompt: "step-specific task"
  injected_artifacts: []
  constraints: []
  expected_output_format: "schema or compact checklist for this step"
```

The prompt may include approved artifacts as plain context, but not the baton object, workflow graph, allowed transitions, or current global node.

## Workflow graph

```yaml
workflow:
  id: dev-harness
  initial_step: research
  steps:
    research:
      kind: worker
      prompt_template: research
      output_schema: research_packet
      outcomes:
        complete: user_approval_research
        blocked: blocked

    user_approval_research:
      kind: approval
      input: research_packet
      outcomes:
        approved: architecture
        changes_requested: research
        blocked: blocked

    architecture:
      kind: worker
      prompt_template: architecture
      output_schema: architecture_packet
      outcomes:
        complete: user_approval_architecture
        blocked: blocked

    user_approval_architecture:
      kind: approval
      input: architecture_packet
      outcomes:
        approved: implementation_plan
        changes_requested: architecture
        blocked: blocked

    implementation_plan:
      kind: worker
      prompt_template: implementation_plan
      output_schema: implementation_plan
      outcomes:
        complete: user_approval_plan
        blocked: blocked

    user_approval_plan:
      kind: approval
      input: implementation_plan
      outcomes:
        approved: implementation
        changes_requested: implementation_plan
        blocked: blocked

    implementation:
      kind: worker
      prompt_template: implementation
      output_schema: implementation_artifact
      outcomes:
        complete: review
        blocked: blocked

    review:
      kind: worker
      prompt_template: review
      output_schema: review_artifact
      outcomes:
        approved: done
        changes_requested: implementation
        blocked: blocked

    blocked:
      kind: terminal

    done:
      kind: terminal
```

## Baton schema

The baton is a compact snapshot for recovery and audit. It is not sent to workers.

```yaml
baton:
  workflow_id: dev-harness
  current_step: research
  task: "original user task"
  repo: null
  branch: null
  constraints: []
  artifacts:
    research_packet: null
    architecture_packet: null
    implementation_plan: null
    implementation_artifact: null
    review_artifact: null
    files: []
    commits: []
    prs: []
    notes: []
  approvals:
    research: null
    architecture: null
    implementation_plan: null
  status: in_progress
  blocker: null
  history:
    - step: research
      outcome: null
      summary: null
      evidence: []
```

## Transition helper contract

```yaml
transition_helper_input:
  workflow: "finite state machine definition"
  baton: "current baton matching baton schema"
  worker_output: "output returned by worker or approval step"

transition_helper_validates:
  - baton matches baton schema
  - worker_output matches output schema for baton.current_step
  - extracted outcome exists in workflow graph
  - transition from baton.current_step by extracted outcome is allowed

transition_result:
  baton: "updated baton in the same schema"
  next_step:
    id: null
    kind: null
    template: null
    inputs: []
    action: "generate_worker_prompt | wait_for_approval | stop_done | stop_blocked"
```

## Recovery rules

- Resume from the baton, not from a worker's opinion about what should happen next.
- Verify repo, branch, approvals, and referenced artifacts before trusting the baton.
- Approval gates cannot be inferred; wait for explicit approval.
- If validation fails, keep the baton unchanged and stop with `blocker`.
- Keep artifacts compact enough to inject into the next generated prompt.
