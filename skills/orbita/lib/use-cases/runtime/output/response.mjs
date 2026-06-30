import { buildStepEntries, buildStepEntry } from '../../executable-steps.mjs';
import { invariant } from '../../../errors.mjs';
import { appendPromptText } from '../../../runtime/prompt-text.mjs';
import { assertResponseSchema } from './response-schema.mjs';
import { normalizeCursor } from '../../../runtime/cursor.mjs';

export function hasAppliedOutputForStep(baton, stepId) {
  return Boolean(baton.state && Object.hasOwn(baton.state, stepId));
}

export function responseFor(baton, stepId, step, workflow, { parallelTargets = false } = {}) {
  if (parallelTargets) invariant(workflow && Array.isArray(step.next), `workflow step '${stepId}' cannot expose parallel branch steps`);
  const response = { baton, steps: buildStepEntries(stepId, step, workflow, { parallelTargets }) };
  assertResponseSchema(response);
  return response;
}

export function responseForCursor(baton, workflow) {
  const stepIds = normalizeCursor(baton.cursor);
  const response = {
    baton,
    steps: stepIds.map((stepId) => {
      const step = workflow.steps?.[stepId];
      invariant(step, `baton cursor not found in workflow: ${stepId}`);
      return buildStepEntry(stepId, step);
    }),
  };
  assertResponseSchema(response);
  return response;
}

export function stepWithValidationFeedback(step, feedbackPrompt) {
  const updatedStep = structuredClone(step);
  updatedStep.input = {
    ...(updatedStep.input ?? {}),
    prompt: appendPromptText(updatedStep.input?.prompt, feedbackPrompt),
  };
  return updatedStep;
}
