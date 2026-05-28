import { actionForStep } from './model.mjs';

export function buildDirective(stepId, step) {
  return {
    id: stepId,
    action: actionForStep(step),
    step: structuredClone(step),
  };
}

export function buildParallelDirective(stepId, step, workflow, targets) {
  return {
    id: stepId,
    action: 'run_parallel',
    step: structuredClone(step),
    parallel: targets.map((targetStepId) => {
      const targetStep = workflow.steps[targetStepId];
      return {
        id: targetStepId,
        action: actionForStep(targetStep),
        step: structuredClone(targetStep),
      };
    }),
  };
}
