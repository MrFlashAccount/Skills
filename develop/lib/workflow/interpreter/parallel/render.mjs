import { applyOutputToBatonState } from '../../state.mjs';
import { renderWorkflowPrompt } from '../../prompt-renderer.mjs';
import { invariant } from '../../errors.mjs';
import { responseFor } from '../output/response.mjs';

function hasAnyWorkerOutput({ workflow, baton }) {
  const state = baton?.state ?? {};
  return Object.entries(workflow?.steps ?? {}).some(([stepId, step]) => step?.kind === 'worker' && Object.hasOwn(state, stepId));
}

function initialUserPromptStepId({ workflow, baton, steps }) {
  if (typeof baton?.user_prompt !== 'string') return undefined;
  if (hasAnyWorkerOutput({ workflow, baton })) return undefined;
  return steps.find((entry) => entry.step?.kind === 'worker')?.id;
}

export function renderStepPrompts({ workflowPath, workflow, baton, steps, repositoryRoot, templateBaseDir, includeDiagnostics = false } = {}) {
  const userPromptStepId = initialUserPromptStepId({ workflow, baton, steps });
  return steps.map((entry) => ({
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
      includeInitialUserPrompt: userPromptStepId === entry.id,
    }),
  }));
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
