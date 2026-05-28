import { statusForStep } from '../model.mjs';
import { applyOutputToBatonState } from '../state.mjs';
import { invariant } from '../errors.mjs';
import { resolveTransition } from '../transitions.mjs';
import { responseFor } from './run-step.mjs';

export function applyNextTransition({ workflow, baton, cursorStep, workerOutput }) {
  const { targetStepId, attempts } = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput });
  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);

  const updatedBaton = structuredClone(baton);
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, attempts, cursorStep.kind === 'worker' ? baton.cursor : undefined, {
    mirrorToOutputs: Boolean(cursorStep.output?.schema),
  });
  delete updatedBaton.blocker;
  if (updatedBaton.status === 'blocked' && workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  return responseFor(updatedBaton, targetStepId, targetStep, workflow);
}
