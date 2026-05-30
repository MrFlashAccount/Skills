import { assertResponseSchema } from '../schema-validation.mjs';
import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../transitions.mjs';
import { loadWorkflowAndBaton } from './guards/workflow.mjs';
import { hasAppliedOutputForStep, responseFor } from './output/response.mjs';
import { renderStepPrompts } from './parallel/render.mjs';
import { applyWorkflowOutput } from './output/apply.mjs';

export { applyWorkflowOutput } from './output/apply.mjs';
export { loadWorkflowAndBaton } from './guards/workflow.mjs';
export { renderStepPrompts } from './parallel/render.mjs';

function preparedParallelStep({ workflow, baton, cursorStep }) {
  if (!hasAppliedOutputForStep(baton, baton.cursor)) return { step: cursorStep, parallelTargets: false };
  if (isStaticParallelNext(cursorStep.next)) return { step: cursorStep, parallelTargets: true };
  if (!isDynamicTransitionNext(cursorStep.next)) return { step: cursorStep, parallelTargets: false };

  const resolved = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: baton.state[baton.cursor] });
  if (!resolved.targetStepIds) return { step: cursorStep, parallelTargets: false };
  return { step: { ...cursorStep, next: resolved.targetStepIds }, parallelTargets: true };
}

export function inspectWorkflow(workflowPath, batonPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const prepared = preparedParallelStep({ workflow, baton, cursorStep });
  return responseFor(baton, baton.cursor, prepared.step, workflow, { parallelTargets: prepared.parallelTargets });
}

export function renderInterpreterResponse(workflowPath, batonPath, response, options = {}) {
  const { workflow } = loadWorkflowAndBaton(workflowPath, batonPath);
  const rendered = {
    ...response,
    steps: renderStepPrompts({
      workflowPath,
      workflow,
      baton: response.baton,
      steps: response.steps,
      repositoryRoot: options.repositoryRoot,
      templateBaseDir: options.templateBaseDir,
      includeDiagnostics: options.includeDiagnostics,
    }),
  };
  assertResponseSchema(rendered);
  return rendered;
}

export function renderWorkflow(workflowPath, batonPath, options = {}) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const prepared = preparedParallelStep({ workflow, baton, cursorStep });
  const response = responseFor(baton, baton.cursor, prepared.step, workflow, { parallelTargets: prepared.parallelTargets });
  return renderInterpreterResponse(workflowPath, batonPath, response, options);
}
