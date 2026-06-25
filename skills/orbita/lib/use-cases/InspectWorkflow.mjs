/** InspectWorkflow use-case returns the current unrendered workflow response contract. */
import { resolveTransition } from '../entities/Step/index.mjs';
import { isDynamicTransitionNext, isStaticParallelNext } from '../runtime/transition-next.mjs';
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';
import { hasAppliedOutputForStep, responseFor } from './runtime/output/response.mjs';

function preparedParallelStep({ workflow, baton, cursorStep }) {
  if (!hasAppliedOutputForStep(baton, baton.cursor)) return { step: cursorStep, parallelTargets: false };
  if (isStaticParallelNext(cursorStep.next)) return { step: cursorStep, parallelTargets: true };
  if (!isDynamicTransitionNext(cursorStep.next)) return { step: cursorStep, parallelTargets: false };

  const resolved = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: baton.state[baton.cursor] });
  if (!resolved.targetStepIds) return { step: cursorStep, parallelTargets: false };
  return { step: { ...cursorStep, next: resolved.targetStepIds }, parallelTargets: true };
}

export function inspectWorkflow({ workflowDoc, batonDoc, resources } = {}) {
  const { workflow, baton, cursorStep } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles, outputSchemas: resources?.outputSchemas });
  const prepared = preparedParallelStep({ workflow, baton, cursorStep });
  return responseFor(baton, baton.cursor, prepared.step, workflow, { parallelTargets: prepared.parallelTargets });
}

export const InspectWorkflow = { execute: inspectWorkflow };
