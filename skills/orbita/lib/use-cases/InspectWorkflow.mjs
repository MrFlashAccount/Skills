/** InspectWorkflow use-case returns the current unrendered workflow response contract. */
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';
import { responseForCursor } from './runtime/output/response.mjs';

export function inspectWorkflow({ workflowDoc, batonDoc, resources } = {}) {
  const { workflow, baton } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles, outputSchemas: resources?.outputSchemas });
  return responseForCursor(baton, workflow);
}

export const InspectWorkflow = { execute: inspectWorkflow };
