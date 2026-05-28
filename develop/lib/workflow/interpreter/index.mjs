import { assertResponseSchema } from '../schema-validation.mjs';
import { loadWorkflowAndBaton } from './guards/workflow.mjs';
import { hasAppliedOutputForStep, responseFor } from './output/response.mjs';
import { renderStepPrompts } from './parallel/render.mjs';
import { applyWorkflowOutput } from './output/apply.mjs';

export { applyWorkflowOutput } from './output/apply.mjs';
export { loadWorkflowAndBaton } from './guards/workflow.mjs';
export { renderStepPrompts } from './parallel/render.mjs';

function shouldExposeParallelTargets(baton, cursorStep) {
  return Array.isArray(cursorStep.next) && hasAppliedOutputForStep(baton, baton.cursor);
}

export function inspectWorkflow(workflowPath, batonPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  return responseFor(baton, baton.cursor, cursorStep, workflow, { parallelTargets: shouldExposeParallelTargets(baton, cursorStep) });
}

export function renderWorkflow(workflowPath, batonPath, options = {}) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const response = responseFor(baton, baton.cursor, cursorStep, workflow, { parallelTargets: shouldExposeParallelTargets(baton, cursorStep) });
  const rendered = {
    ...response,
    steps: renderStepPrompts({
      workflowPath,
      workflow,
      baton,
      steps: response.steps,
      repositoryRoot: options.repositoryRoot,
      templateBaseDir: options.templateBaseDir,
      includeDiagnostics: options.includeDiagnostics,
    }),
  };
  assertResponseSchema(rendered);
  return rendered;
}
