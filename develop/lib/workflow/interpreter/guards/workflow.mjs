import { Workflow } from '../../../entities/Workflow.mjs';
import { Baton } from '../../../entities/Baton.mjs';
import { readJson } from '../../json-io.mjs';

function assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, workflowPath) {
  const workflow = new Workflow(workflowDoc);
  workflow.validateForRuntime();
  const baton = new Baton(batonDoc);
  baton.validateAgainst(workflow);
  const cursorStep = workflow.inferStep(baton).toJSON();
  return { workflow: workflow.toJSON(), baton: baton.toJSON(), cursorStep };
}

export function loadWorkflowAndBaton(workflowPath, batonPath) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  const baton = readJson(batonPath, 'baton');
  return assertLoadedWorkflowAndBaton(workflowDoc, baton, workflowPath);
}

export function loadWorkflowWithBaton(workflowPath, baton) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  return assertLoadedWorkflowAndBaton(workflowDoc, baton, workflowPath);
}
