import { applyOutputToBatonState } from '../../../entities/Baton/state.mjs';
import { renderWorkflowPrompt } from '../../../entities/Template/prompt-renderer.mjs';
import { invariant } from '../../../entities/Workflow/errors.mjs';
import { responseFor } from '../output/response.mjs';
import { assertStartupUserPromptTargetRenderable, markUserPromptInjectedForStep, selectedUserPromptStepId, validateSelectedStartupUserPromptTarget } from '../../../entities/Baton/user-prompt.mjs';

export function renderStepPrompts({ workflowPath, workflow, baton, steps, repositoryRoot, templateBaseDir, includeDiagnostics = false, resourceAdapters = {} } = {}) {
  assertStartupUserPromptTargetRenderable({ workflow, baton, steps });
  const userPromptStepId = selectedUserPromptStepId({ workflow, baton });
  const rendered = steps.map((entry) => ({
    ...entry,
    compiledPrompt: renderWorkflowPrompt({
      workflowPath,
      workflow,
      baton,
      stepId: entry.id,
      step: entry.step,
      repositoryRoot,
      templateBaseDir,
      includeDiagnostics,
      userPrompt: userPromptStepId === entry.id ? baton.user_prompt : undefined,
      resourceAdapters,
    }),
  }));
  return rendered;
}

export function prepareParallelBranch({ workflow, baton, stepId, step, output, attempts, targets = step.next, storeStepOutput = false }) {
  invariant(Array.isArray(targets), `workflow step '${stepId}' cannot prepare parallel branch steps without array next`);
  let updatedBaton = structuredClone(baton);
  const outputStepId = step.kind === 'worker' || storeStepOutput ? stepId : undefined;
  updatedBaton = markUserPromptInjectedForStep({
    workflow,
    baton: updatedBaton,
    stepId,
  });
  updatedBaton = validateSelectedStartupUserPromptTarget({
    workflow,
    baton: updatedBaton,
    steps: targets.map((targetId) => ({ id: targetId, step: workflow.steps[targetId] })),
  });
  updatedBaton.state = applyOutputToBatonState(updatedBaton, output, attempts, outputStepId, {
    mirrorToOutputs: Boolean(step.output?.schema),
  });
  updatedBaton.status = 'running';
  delete updatedBaton.blocker;
  return responseFor(updatedBaton, stepId, { ...step, next: targets }, workflow, { parallelTargets: true });
}
