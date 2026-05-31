const STEP_ACTIONS = Object.freeze({
  worker: 'run_worker',
  approval: 'wait_for_approval',
  done: 'stop_done',
  blocked: 'stop_blocked',
});

function actionForStep(step) {
  return STEP_ACTIONS[step.kind];
}

function statusForStep(workflow, stepId, step) {
  if (step.kind === 'done' || stepId === workflow.done) return 'done';
  if (step.kind === 'blocked' || stepId === workflow.blocked) return 'blocked';
  return 'running';
}

/** Behavior wrapper over a workflow DTO. */
export class Workflow {
  constructor(dto) {
    this.dto = dto;
  }

  get name() { return this.dto?.name; }
  get start() { return this.dto?.start; }
  get done() { return this.dto?.done; }
  get blocked() { return this.dto?.blocked; }
  get steps() { return this.dto?.steps ?? {}; }

  step(stepId) {
    const step = this.steps[stepId];
    return step ? new Step(stepId, step, this) : undefined;
  }

  actionFor(stepId) {
    return actionForStep(this.steps[stepId]);
  }

  statusFor(stepId) {
    return statusForStep(this.dto, stepId, this.steps[stepId]);
  }
}

/** Behavior wrapper over a step DTO. */
export class Step {
  constructor(id, dto, workflow) {
    this.id = id;
    this.dto = dto;
    this.workflow = workflow;
  }

  get kind() { return this.dto?.kind; }
  get input() { return this.dto?.input ?? {}; }
  get output() { return this.dto?.output ?? {}; }
  get next() { return this.dto?.next; }

  action() { return actionForStep(this.dto); }
  status() { return this.workflow ? statusForStep(this.workflow.dto, this.id, this.dto) : undefined; }
}
