import { applyOutputToBatonState } from '../../state.mjs';
import { renderWorkflowPrompt } from '../../prompt-renderer.mjs';
import { invariant } from '../../errors.mjs';
import { responseFor } from '../output/response.mjs';

export function renderStepPrompts({ workflowPath, workflow, baton, steps, repositoryRoot, templateBaseDir, includeDiagnostics = false } = {}) {
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
    }),
  }));
}

export function prepareParallelBranch({ workflow, baton, stepId, step, output, attempts }) {
  invariant(Array.isArray(step.next), `workflow step '${stepId}' cannot prepare parallel branch steps without array next`);
  const updatedBaton = structuredClone(baton);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, output, attempts, step.kind === 'worker' ? stepId : undefined, {
    mirrorToOutputs: Boolean(step.output?.schema),
  });
  updatedBaton.status = 'running';
  delete updatedBaton.blocker;
  return responseFor(updatedBaton, stepId, step, workflow, { parallelTargets: true });
}
