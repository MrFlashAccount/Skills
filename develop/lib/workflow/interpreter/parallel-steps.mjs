import { applyOutputToBatonState } from '../state.mjs';
import { renderWorkflowPrompt } from '../prompt-renderer.mjs';
import { invariant } from '../errors.mjs';
import { responseFor } from './run-step.mjs';

export function renderParallelBranchPrompts({ workflowPath, workflow, baton, directive, repositoryRoot, templateBaseDir, includeDiagnostics = false } = {}) {
  invariant(directive?.action === 'run_parallel', 'parallel branch prompt rendering requires a run_parallel directive');
  return directive.parallel.map((branch) => ({
    id: branch.id,
    action: branch.action,
    step: structuredClone(branch.step),
    compiledPrompt: renderWorkflowPrompt({
      workflowPath,
      workflow,
      baton,
      stepId: branch.id,
      step: branch.step,
      repositoryRoot,
      templateBaseDir,
      includeDiagnostics,
    }),
  }));
}

export function prepareParallelBranch({ workflow, baton, stepId, step, output, attempts }) {
  const join = workflow.steps[step.next[0]].next;
  const updatedBaton = structuredClone(baton);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, output, attempts, step.kind === 'worker' ? stepId : undefined, {
    mirrorToOutputs: Boolean(step.output?.schema),
  });
  updatedBaton.parallel = { from: stepId, targets: structuredClone(step.next), join };
  updatedBaton.status = 'running';
  delete updatedBaton.blocker;
  return responseFor(updatedBaton, stepId, step, workflow);
}
