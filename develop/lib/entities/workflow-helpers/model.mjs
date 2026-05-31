const STEP_ACTIONS = Object.freeze({
  worker: 'run_worker',
  approval: 'wait_for_approval',
  done: 'stop_done',
  blocked: 'stop_blocked',
});

export function actionForStep(step) {
  return STEP_ACTIONS[step.kind];
}

export function statusForStep(workflow, stepId, step) {
  if (step.kind === 'done' || stepId === workflow.done) return 'done';
  if (step.kind === 'blocked' || stepId === workflow.blocked) return 'blocked';
  return 'running';
}
