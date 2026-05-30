import { statusForStep } from '../../model.mjs';
import { applyOutputToBatonState } from '../../state.mjs';
import { invariant } from '../../errors.mjs';
import { resolveTransition } from '../../transitions.mjs';
import { prepareParallelBranch } from '../parallel/render.mjs';
import { responseFor } from '../output/response.mjs';
import { markUserPromptInjectedForStep, withSelectedStartupUserPromptTarget } from '../../user-prompt.mjs';

export function applyNextTransition({ workflow, baton, cursorStep, workerOutput }) {
  const { targetStepId, targetStepIds, attempts } = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput });
  if (targetStepIds) {
    return prepareParallelBranch({
      workflow,
      baton,
      stepId: baton.cursor,
      step: cursorStep,
      output: workerOutput,
      attempts,
      targets: targetStepIds,
      storeStepOutput: true,
    });
  }

  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);

  let updatedBaton = structuredClone(baton);
  updatedBaton = markUserPromptInjectedForStep({
    workflow,
    baton: updatedBaton,
    stepId: baton.cursor,
  });
  updatedBaton = withSelectedStartupUserPromptTarget({
    workflow,
    baton: updatedBaton,
    steps: [{ id: targetStepId, step: targetStep }],
  });
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, attempts, ['worker', 'approval'].includes(cursorStep.kind) ? baton.cursor : undefined, {
    mirrorToOutputs: Boolean(cursorStep.output?.schema),
  });
  delete updatedBaton.blocker;
  if (updatedBaton.status === 'blocked' && workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  return responseFor(updatedBaton, targetStepId, targetStep, workflow);
}
