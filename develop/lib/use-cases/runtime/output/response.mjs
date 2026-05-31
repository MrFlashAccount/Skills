import { buildStepEntries } from '../../executable-steps.mjs';
import { invariant } from '../../../entities/errors.mjs';
import { assertResponseSchema } from '../../../schemas/workflow-schema.mjs';

export function hasAppliedOutputForStep(baton, stepId) {
  return Boolean(baton.state && Object.hasOwn(baton.state, stepId));
}

export function responseFor(baton, stepId, step, workflow, { parallelTargets = false } = {}) {
  if (parallelTargets) invariant(workflow && Array.isArray(step.next), `workflow step '${stepId}' cannot expose parallel branch steps`);
  const response = { baton, steps: buildStepEntries(stepId, step, workflow, { parallelTargets }) };
  assertResponseSchema(response);
  return response;
}

export function stepWithValidationFeedback(step, feedbackPrompt) {
  const updatedStep = structuredClone(step);
  updatedStep.input = {
    ...(updatedStep.input ?? {}),
    prompt: [updatedStep.input?.prompt, feedbackPrompt].filter(Boolean).join('\n\n'),
  };
  return updatedStep;
}
