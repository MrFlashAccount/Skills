import { assertResponseSchema } from '../schema-validation.mjs';
import { renderWorkflowPrompt } from '../prompt-renderer.mjs';
import { loadWorkflowAndBaton } from './validation.mjs';
import { responseFor } from './run-step.mjs';
import { renderParallelBranchPrompts } from './parallel-steps.mjs';
import { applyWorkflowOutput } from './apply-output.mjs';

export { applyWorkflowOutput } from './apply-output.mjs';
export { loadWorkflowAndBaton } from './validation.mjs';
export { renderParallelBranchPrompts } from './parallel-steps.mjs';

export function inspectWorkflow(workflowPath, batonPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  return responseFor(baton, baton.cursor, cursorStep, workflow);
}

export function renderWorkflow(workflowPath, batonPath, options = {}) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const response = responseFor(baton, baton.cursor, cursorStep, workflow);
  const rendered = {
    ...response,
    compiledPrompt: renderWorkflowPrompt({
      workflowPath,
      workflow,
      baton,
      stepId: baton.cursor,
      step: cursorStep,
      repositoryRoot: options.repositoryRoot,
      templateBaseDir: options.templateBaseDir,
      includeDiagnostics: options.includeDiagnostics,
    }),
  };
  if (response.directive.action === 'run_parallel') {
    rendered.compiledParallelPrompts = renderParallelBranchPrompts({
      workflowPath,
      workflow,
      baton,
      directive: response.directive,
      repositoryRoot: options.repositoryRoot,
      templateBaseDir: options.templateBaseDir,
      includeDiagnostics: options.includeDiagnostics,
    });
  }
  assertResponseSchema(rendered);
  return rendered;
}
