const STEP_ACTIONS = Object.freeze({
  worker: 'run_worker',
  approval: 'wait_for_approval',
  done: 'stop_done',
});

export function actionForStep(step) {
  const action = STEP_ACTIONS[step.kind];
  if (!action) throw new Error(`workflow step kind '${step.kind}' cannot be exposed as host work`);
  return action;
}

export function statusForStep(workflow, stepId, step) {
  if (step.kind === 'done' || stepId === workflow.done) return 'done';
  return 'running';
}
