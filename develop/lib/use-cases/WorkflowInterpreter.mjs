import { assertResponseSchema } from '../entities/workflow-helpers/schema-validation.mjs';
import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../entities/Step.mjs';
import { assertLoadedWorkflowAndBaton } from './interpreter/guards/workflow.mjs';
import { hasAppliedOutputForStep, responseFor } from './interpreter/output/response.mjs';
import { renderStepPrompts } from './interpreter/parallel/render.mjs';
import { applyWorkflowOutput } from './interpreter/output/apply.mjs';

export { applyWorkflowOutput } from './interpreter/output/apply.mjs';
export { assertLoadedWorkflowAndBaton } from './interpreter/guards/workflow.mjs';
export { renderStepPrompts } from './interpreter/parallel/render.mjs';

function preparedParallelStep({ workflow, baton, cursorStep }) {
  if (!hasAppliedOutputForStep(baton, baton.cursor)) return { step: cursorStep, parallelTargets: false };
  if (isStaticParallelNext(cursorStep.next)) return { step: cursorStep, parallelTargets: true };
  if (!isDynamicTransitionNext(cursorStep.next)) return { step: cursorStep, parallelTargets: false };

  const resolved = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: baton.state[baton.cursor] });
  if (!resolved.targetStepIds) return { step: cursorStep, parallelTargets: false };
  return { step: { ...cursorStep, next: resolved.targetStepIds }, parallelTargets: true };
}

export function inspectWorkflow({ workflowDoc, batonDoc, resources } = {}) {
  const { workflow, baton, cursorStep } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles });
  const prepared = preparedParallelStep({ workflow, baton, cursorStep });
  return responseFor(baton, baton.cursor, prepared.step, workflow, { parallelTargets: prepared.parallelTargets });
}

export function renderInterpreterResponse({ workflowDoc, response, resources, includeDiagnostics = false } = {}) {
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

export function renderWorkflow({ workflowDoc, batonDoc, resources, includeDiagnostics = false } = {}) {
  const { workflow, baton, cursorStep } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles });
  const prepared = preparedParallelStep({ workflow, baton, cursorStep });
  const response = responseFor(baton, baton.cursor, prepared.step, workflow, { parallelTargets: prepared.parallelTargets });
  return renderInterpreterResponse({ workflowDoc, response, resources, includeDiagnostics });
}
