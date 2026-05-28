import { evaluatePathExpression, isExpressionString } from './expressions/index.mjs';
import { invariant } from './errors.mjs';
import { projectState } from './projection.mjs';
import { resolveRetryPolicy } from './retry.mjs';
import { assertParallelTargets, assertTransitionTarget } from './interpreter/parallel/targets.mjs';

function requireObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
}

function readTransitionField(output, fieldName, stepId) {
  invariant(Object.hasOwn(output, fieldName), `cursor '${stepId}' output missing transition field '${fieldName}'`);
  const value = output[fieldName];
  invariant(typeof value === 'string' && value.length > 0, `cursor '${stepId}' transition field '${fieldName}' must be a non-empty string`);
  return value;
}

function validateOutputKind(step, output, stepId) {
  if (step.kind === 'approval') {
    invariant(!('outcome' in output), `approval cursor '${stepId}' must use approval, not outcome`);
    invariant('approval' in output, `approval cursor '${stepId}' must include string approval`);
    return;
  }

  if (step.kind === 'worker') {
    invariant(!('approval' in output), `worker cursor '${stepId}' must use outcome, not approval`);
    invariant('outcome' in output, `worker cursor '${stepId}' must include string outcome`);
  }
}

function contextInputForStep(baton, step, stepId) {
  return projectState({ batonState: baton.state ?? {}, selectors: step.input?.state ?? [], stepId }).value;
}

function resolveDynamicNext({ workflow, baton, stepId, step, output, next }) {
  const input = contextInputForStep(baton, step, stepId);
  const resolved = evaluatePathExpression(next, { output, input });

  if (typeof resolved === 'string') {
    invariant(resolved.length > 0, `workflow step '${stepId}' dynamic next resolved to an empty string`);
    assertTransitionTarget(workflow, stepId, 'next', resolved);
    return { targetStepId: resolved };
  }

  if (Array.isArray(resolved)) {
    assertParallelTargets(workflow, stepId, resolved, 'next');
    return { targetStepIds: structuredClone(resolved) };
  }

  invariant(false, `workflow step '${stepId}' dynamic next must resolve to a string step id or array of step ids`);
}

export function resolveTransition({ workflow, baton, stepId, step, output }) {
  requireObject(output, 'worker output');
  invariant(step.kind !== 'done' && step.kind !== 'blocked', `cursor '${stepId}' is terminal and cannot be applied`);
  validateOutputKind(step, output, stepId);

  const next = step.next;
  if (typeof next === 'string') {
    if (isExpressionString(next)) return resolveDynamicNext({ workflow, baton, stepId, step, output, next });
    return { targetStepId: next };
  }

  const by = next.by;
  const fieldValue = readTransitionField(output, by, stepId);
  invariant(Object.hasOwn(next.map, fieldValue), `transition value '${fieldValue}' is not allowed from cursor '${stepId}' by '${by}'`);

  const target = next.map[fieldValue];
  if (typeof target === 'string') return { targetStepId: target };
  return resolveRetryPolicy({ baton, stepId, by, value: fieldValue, policy: target });
}
