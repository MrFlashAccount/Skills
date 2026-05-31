import { actionForStep } from './model.mjs';

export function buildStepEntry(stepId, step) {
  return {
    id: stepId,
    action: actionForStep(step),
    step: structuredClone(step),
  };
}

export function buildStepEntries(stepId, step, workflow, { parallelTargets = false } = {}) {
  if (!parallelTargets) return [buildStepEntry(stepId, step)];
  return step.next.map((targetStepId) => buildStepEntry(targetStepId, workflow.steps[targetStepId]));
}
