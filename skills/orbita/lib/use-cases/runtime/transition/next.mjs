import { Step } from '../../../entities/Step/index.mjs';
import { prepareParallelBranch } from '../parallel/render.mjs';
import { responseFor } from '../output/response.mjs';
import { markUserPromptInjectedForStep, validateSelectedStartupUserPromptTarget } from '../../user-prompt.mjs';

export function applyNextTransition({ workflow, baton, cursorStep, workerOutput }) {
  const cursor = new Step({ id: baton.cursor, step: cursorStep });
  const batonWithPromptMarker = markUserPromptInjectedForStep({
    workflow,
    baton,
    stepId: baton.cursor,
  });
  const applied = cursor.applyOutput({ workflow, baton: batonWithPromptMarker, output: workerOutput });
  if (applied.targetStepIds) {
    return prepareParallelBranch({
      workflow,
      baton,
      stepId: baton.cursor,
      step: cursorStep,
      output: workerOutput,
      attempts: applied.attempts,
      targets: applied.targetStepIds,
      storeStepOutput: true,
    });
  }

  const updatedBaton = validateSelectedStartupUserPromptTarget({
    workflow,
    baton: applied.baton,
    steps: [{ id: applied.targetStepId, step: applied.targetStep }],
  });

  return responseFor(updatedBaton, applied.targetStepId, applied.targetStep, workflow);
}
