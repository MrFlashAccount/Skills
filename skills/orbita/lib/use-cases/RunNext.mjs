/** RunNext use-case coordinates Workflow/Baton/Step/Template for the next rendered runtime response. */
import { assertResponseSchema } from './runtime/output/response-schema.mjs';
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';
import { responseForCursor } from './runtime/output/response.mjs';
import { renderStepPrompts } from './runtime/parallel/render.mjs';

export function runNext({ workflowDoc, batonDoc, resources, includeDiagnostics = false, followUp = false } = {}) {
  const { workflow, baton } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles, outputSchemas: resources?.outputSchemas });
  const response = responseForCursor(baton, workflow);
  const rendered = {
    ...response,
    steps: renderStepPrompts({
      workflow,
      baton: response.baton,
      steps: response.steps,
      resources,
      includeDiagnostics,
      followUp,
    }),
  };
  assertResponseSchema(rendered);
  return rendered;
}

export const RunNext = { execute: runNext };
