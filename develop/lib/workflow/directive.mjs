import { actionForStep } from './model.mjs';

export function buildDirective(stepId, step) {
  return {
    id: stepId,
    action: actionForStep(step),
    vertex: structuredClone(step),
  };
}
