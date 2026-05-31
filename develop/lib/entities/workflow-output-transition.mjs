import { applyNextTransition as applyNextWorkflowTransition } from '../workflow/interpreter/transition/next.mjs';
import { prepareParallelBranch as prepareWorkflowParallelBranch } from '../workflow/interpreter/parallel/render.mjs';

/** Entity wrapper for pure workflow output transitions. */
export class WorkflowOutputTransition {
  prepareParallelBranch({ workflow, baton, step, workerOutput }) {
    return prepareWorkflowParallelBranch({
      workflow,
      baton,
      stepId: baton.cursor,
      step,
      output: workerOutput,
      attempts: undefined,
      storeStepOutput: step.kind === 'approval',
    });
  }

  applyNextTransition({ workflow, baton, step, workerOutput }) {
    return applyNextWorkflowTransition({ workflow, baton, cursorStep: step, workerOutput });
  }
}
