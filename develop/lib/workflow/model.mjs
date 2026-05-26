import { invariant } from './errors.mjs';

const STEP_ACTIONS = Object.freeze({
  worker: 'run_worker',
  approval: 'wait_for_approval',
  done: 'stop_done',
  blocked: 'stop_blocked',
});

function requireStep(workflow, stepId, label) {
  invariant(Object.hasOwn(workflow.steps, stepId), `${label} target not found in workflow: ${stepId}`);
}

function nextTargets(next) {
  if (!next) return [];
  if (typeof next === 'string') return [next];
  const targets = [];
  for (const [label, entry] of Object.entries(next.map)) {
    if (typeof entry === 'string') targets.push(entry);
    else targets.push(entry.target, entry.onLimit);
  }
  return targets;
}

export function actionForStep(step) {
  return STEP_ACTIONS[step.kind];
}

export function validateWorkflowModel(workflow) {
  requireStep(workflow, workflow.start, 'workflow.start');
  requireStep(workflow, workflow.done, 'workflow.done');
  requireStep(workflow, workflow.blocked, 'workflow.blocked');

  for (const [stepId, step] of Object.entries(workflow.steps)) {
    invariant(Object.hasOwn(STEP_ACTIONS, step.kind), `unsupported workflow step kind at ${stepId}: ${step.kind}`);
    if (step.kind === 'done' || step.kind === 'blocked') {
      invariant(!('next' in step), `workflow.steps.${stepId}.next is not supported for ${step.kind} steps`);
      continue;
    }
    invariant('next' in step, `workflow.steps.${stepId}.next is required for ${step.kind} steps`);
    for (const target of nextTargets(step.next)) requireStep(workflow, target, `workflow.steps.${stepId}.next`);
  }
}

export function statusForStep(workflow, stepId, step) {
  if (step.kind === 'done' || stepId === workflow.done) return 'done';
  if (step.kind === 'blocked' || stepId === workflow.blocked) return 'blocked';
  return 'running';
}
