/** ContinueRun use-case applies output, then renders the next or terminal runtime response. */
import { assertResponseSchema } from '../entities/workflow-helpers/schema-validation.mjs';
import { applyWorkflowOutput } from './ApplyWorkflowOutput.mjs';
import { renderStepPrompts } from './runtime/parallel/render.mjs';
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';

export function renderAppliedResponse({ workflowDoc, response, resources, includeDiagnostics = false } = {}) {
  const { workflow } = assertLoadedWorkflowAndBaton(workflowDoc, response.baton, { allowedRoles: resources?.allowedRoles });
  const rendered = {
    ...response,
    steps: renderStepPrompts({
      workflow,
      baton: response.baton,
      steps: response.steps,
      resources,
      includeDiagnostics,
    }),
  };
  assertResponseSchema(rendered);
  return rendered;
}

export function continueRun({ workflowDoc, batonDoc, outputContent, outputValue, resources, includeDiagnostics = false } = {}) {
  const applied = applyWorkflowOutput({ workflowDoc, batonDoc, outputContent, outputValue, resources });
  return renderAppliedResponse({ workflowDoc, response: applied, resources, includeDiagnostics });
}

export const ContinueRun = { execute: continueRun };
