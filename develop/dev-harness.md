# DevHarness Workflow

DevHarness is a staged-work contract: the orchestrator owns state and approvals; workers receive isolated prompts and return only the requested step output.

## Rules

- Orchestrator owns the graph, baton, approvals, prompt generation, and transition helper calls.
- Workers never see the graph, baton, current node, or allowed transitions.
- Workers do not choose `next`, update `currentStep`, advance global state, or infer approvals.
- Approval gates require Sergey’s explicit approval.
- If validation fails, keep the baton unchanged and stop with `blocker`.

## Workflow contract

```yaml
workflow:
  graph:
    research: {approved: architecture, blocked: blocked}
    architecture: {approved: implementation_plan, blocked: blocked}
    implementation_plan: {approved: implementation, blocked: blocked}
    implementation: {done: review, blocked: blocked}
    review: {passed: done, failed: implementation, blocked: blocked}
  baton:
    currentStep: research
    status: running
    approvedArtifacts: []
  prompt_generation:
    input:
      - shared_contract
      - step_instructions
      - approved_context
      - constraints
      - expected_output_format
    exclude:
      - workflow_graph
      - baton
      - current_global_node
      - allowed_transitions
  transition_helper:
    input:
      workflow: finite_state_machine_definition
      baton: current_baton
      worker_output: worker_or_approval_result
    validates:
      - baton_shape
      - output_shape_for_current_step
      - outcome_exists_in_workflow
      - transition_allowed_from_current_step
    output:
      baton: updated_baton
      next_step:
        id: null
        kind: null
        template: null
        inputs: []
        action: generate_worker_prompt | wait_for_approval | stop_done | stop_blocked
```
