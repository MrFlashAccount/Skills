import { Workflow } from '../../../entities/Workflow/index.mjs';
import { validateWorkflowSemantics } from '../../../entities/Workflow/semantic-validation.mjs';
import { Baton } from '../../../entities/Baton/index.mjs';

export function assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, options = {}) {
  const workflow = new Workflow(workflowDoc);
  validateWorkflowSemantics(workflow, options);
  const baton = new Baton(batonDoc);
  baton.validateAgainst(workflow);
  const cursorStep = workflow.inferStep(baton).toJSON();
  return { workflow: workflow.toJSON(), baton: baton.toJSON(), cursorStep };
}
