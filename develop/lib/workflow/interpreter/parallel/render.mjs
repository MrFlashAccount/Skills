import { applyOutputToBatonState } from '../../state.mjs';
import { renderWorkflowPrompt } from '../../prompt-renderer.mjs';
import { invariant } from '../../errors.mjs';
import { responseFor } from '../output/response.mjs';
import { initialUserPromptStepId } from '../../user-prompt.mjs';

export function renderStepPrompts({ workflowPath, workflow, baton, steps, repositoryRoot, templateBaseDir, includeDiagnostics = false } = {}) {
  const userPromptStepId = initialUserPromptStepId({ workflow, baton, steps });
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
    }),
  }));
  if (userPromptStepId) baton.user_prompt_injected = true;
  return rendered;
}

export function prepareParallelBranch({ workflow, baton, stepId, step, output, attempts, targets = step.next, storeStepOutput = false }) {
  invariant(Array.isArray(targets), `workflow step '${stepId}' cannot prepare parallel branch steps without array next`);
  const updatedBaton = structuredClone(baton);
  const outputStepId = step.kind === 'worker' || storeStepOutput ? stepId : undefined;
  updatedBaton.state = applyOutputToBatonState(updatedBaton, output, attempts, outputStepId, {
    mirrorToOutputs: Boolean(step.output?.schema),
  });
  updatedBaton.status = 'running';
  delete updatedBaton.blocker;
  return responseFor(updatedBaton, stepId, { ...step, next: targets }, workflow, { parallelTargets: true });
}
