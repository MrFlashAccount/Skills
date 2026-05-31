/** RunNext use-case coordinates Workflow/Baton/Step/Template for the next rendered runtime response. */
import { assertResponseSchema } from '../entities/workflow-helpers/schema-validation.mjs';
import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../entities/Step.mjs';
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';
import { hasAppliedOutputForStep, responseFor } from './runtime/output/response.mjs';
import { renderStepPrompts } from './runtime/parallel/render.mjs';

function preparedParallelStep({ workflow, baton, cursorStep }) {
  if (!hasAppliedOutputForStep(baton, baton.cursor)) return { step: cursorStep, parallelTargets: false };
  if (isStaticParallelNext(cursorStep.next)) return { step: cursorStep, parallelTargets: true };
  if (!isDynamicTransitionNext(cursorStep.next)) return { step: cursorStep, parallelTargets: false };

  const resolved = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: baton.state[baton.cursor] });
  if (!resolved.targetStepIds) return { step: cursorStep, parallelTargets: false };
  return { step: { ...cursorStep, next: resolved.targetStepIds }, parallelTargets: true };
}

export function runNext({ workflowDoc, batonDoc, resources, includeDiagnostics = false } = {}) {
  const { workflow, baton, cursorStep } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles, outputSchemas: resources?.outputSchemas });
  const prepared = preparedParallelStep({ workflow, baton, cursorStep });
  const response = responseFor(baton, baton.cursor, prepared.step, workflow, { parallelTargets: prepared.parallelTargets });
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

export const RunNext = { execute: runNext };
