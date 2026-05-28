import { buildDirective, buildParallelDirective } from '../directive.mjs';
import { invariant } from '../errors.mjs';
import { assertResponseSchema } from '../schema-validation.mjs';

function parallelDirectiveForBaton(workflow, baton, cursorStep) {
  const pending = baton.parallel;
  if (!pending) return undefined;
  invariant(pending.from === baton.cursor, `pending parallel branch '${pending.from}' does not match baton cursor '${baton.cursor}'`);
  return buildParallelDirective(baton.cursor, cursorStep, workflow, pending.targets);
}

export function responseFor(baton, stepId, step, workflow) {
  const directive = workflow ? (parallelDirectiveForBaton(workflow, baton, step) ?? buildDirective(stepId, step)) : buildDirective(stepId, step);
  const response = { baton, directive };
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
