import { Workflow } from '../../../entities/Workflow/index.mjs';
import { Baton } from '../../../entities/Baton/index.mjs';

export function assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, options = {}) {
  const workflow = new Workflow(workflowDoc);
  workflow.validate(options);
  const baton = new Baton(batonDoc);
  baton.validateAgainst(workflow);
  const { id: _cursorStepId, ...cursorStep } = workflow.inferStep(baton);
  return { workflow: workflow.toJSON(), baton: baton.toJSON(), cursorStep };
}
