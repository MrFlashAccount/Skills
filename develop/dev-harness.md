# DevHarness Workflow

DevHarness is a fixed baton handoff workflow: each stage receives the approved context it needs, returns one compact artifact, and the orchestrator advances only after required user approvals.

## Fixed workflow

1. Research clarifies facts, constraints, risks, and open questions.
2. Sergey approves the research packet.
3. Architecture proposes the minimal approach and rejected alternative.
4. Sergey approves the architecture packet.
5. Implementation planning turns the approved context into a handoff.
6. Sergey approves the implementation plan.
7. Implementation makes only the approved changes.
8. Review checks the result against the approved plan and returns the final verdict.

## Rules

- The orchestrator is the only owner of `currentStep`, step advancement, and baton updates.
- Subagents receive only the baton fields named by their step plus the prompt template.
- Subagents return one artifact and stop; they do not advance the workflow.
- User approval steps freeze the workflow until explicit approval, then pass the approved artifact forward.
- Implementation starts only after the implementation plan is approved; never implement from stale or implicit approval.
- Keep artifacts compact enough to hand off without re-reading the full conversation.

## State Baton

The baton is a compact state snapshot for handoff and recovery. It preserves the next safe place to continue, but it is not an autonomous loop or permission to keep running without approval.

```yaml
baton:
  workflowId: "dev-harness-<id>"
  task: "original user task"
  repo: null
  branch: null
  currentStep: research
  constraints: []
  approvedArtifacts:
    research: null
    architecture: null
    implementationPlan: null
  currentArtifact:
    step: null
    summary: null
    path: null
  lastResult:
    status: null
    summary: null
    evidence: []
    verification: []
  artifacts:
    files: []
    commits: []
    prs: []
    notes: []
  blocker: null
  retryContext: null
  approvalBoundaries: []

steps:
  research:
    type: subagent
    takes: [baton.task, baton.constraints]
    prompt_template: "Return facts, constraints, risks, open questions, and recommendation."
    produces: research_packet
    next: user_approval_research

  user_approval_research:
    type: user_approval
    takes: [research_packet]
    waits_for: explicit user approval
    on_approval: set baton.approvedArtifacts.research to research_packet
    produces: approved_research_packet
    next: architecture_ab

  architecture_ab:
    type: subagent
    takes: [baton.task, baton.constraints, baton.approvedArtifacts.research]
    prompt_template: "Return selected approach, rejected alternative, risks, and planning constraints."
    produces: architecture_packet
    next: user_approval_architecture

  user_approval_architecture:
    type: user_approval
    takes: [architecture_packet]
    waits_for: explicit user approval
    on_approval: set baton.approvedArtifacts.architecture to architecture_packet
    produces: approved_architecture_packet
    next: implementation_plan

  implementation_plan:
    type: subagent
    takes: [baton.task, baton.constraints, baton.approvedArtifacts.architecture]
    prompt_template: "Return scope, files or zones, verification, risks, and rollback."
    produces: implementation_plan
    next: user_approval_plan

  user_approval_plan:
    type: user_approval
    takes: [implementation_plan]
    waits_for: explicit user approval
    on_approval: set baton.approvedArtifacts.implementationPlan to implementation_plan
    produces: approved_implementation_plan
    next: implementation

  implementation:
    type: subagent
    takes: [baton.task, baton.constraints, baton.approvedArtifacts.implementationPlan]
    prompt_template: "Implement only the approved plan and return changed files, verification, result, and follow-up."
    produces: implementation_artifact
    next: code_review_loop

  code_review_loop:
    type: subagent
    takes: [baton.task, baton.constraints, baton.approvedArtifacts.implementationPlan, implementation_artifact]
    prompt_template: "Review against the approved plan and return verdict, evidence, and remaining risk."
    produces: reviewed_artifact
    next: done

  done:
    type: done
    takes: [reviewed_artifact]
    produces: final_summary
```

## Recovery

- Read the last baton before resuming.
- Verify repo, branch, and referenced artifacts before trusting it.
- Approval gates cannot be inferred; wait for explicit approval.
- Resume only from the next safe step, or stop with `blocker`.
- Keep the baton compact enough to paste into the next worker prompt.
