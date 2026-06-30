import { Step } from '../../../entities/Step/index.mjs';
import { cursorForStepIds } from '../../../runtime/cursor.mjs';
import { responseFor, responseForCursor } from '../output/response.mjs';
import { markUserPromptInjectedForStep, validateSelectedStartupUserPromptTarget } from '../../user-prompt.mjs';

export function applyNextTransition({ workflow, baton, cursorStep, workerOutput, stepId = baton.cursor }) {
  const cursor = new Step({ id: stepId, step: cursorStep });
  const batonWithPromptMarker = markUserPromptInjectedForStep({
    workflow,
    baton,
    stepId,
  });
  const applied = cursor.applyOutput({ workflow, baton: batonWithPromptMarker, output: workerOutput });
  if (applied.targetStepIds) {
    const targetSteps = applied.targetStepIds.map((targetStepId) => ({ id: targetStepId, step: workflow.steps[targetStepId] }));
    const updatedBaton = validateSelectedStartupUserPromptTarget({
      workflow,
      baton: {
        ...applied.baton,
        cursor: cursorForStepIds(applied.targetStepIds),
        status: 'running',
      },
      steps: targetSteps,
    });
    return responseForCursor(updatedBaton, workflow);
  }

  const updatedBaton = validateSelectedStartupUserPromptTarget({
    workflow,
    baton: applied.baton,
    steps: [{ id: applied.targetStepId, step: applied.targetStep }],
  });

  return responseFor(updatedBaton, applied.targetStepId, applied.targetStep, workflow);
}
