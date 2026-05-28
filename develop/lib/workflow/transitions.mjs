import { parsePathExpression, readPath } from './expressions/index.mjs';
import { invariant } from './errors.mjs';
import { projectState } from './projection.mjs';
import { resolveRetryPolicy } from './retry.mjs';
import { assertParallelTargets, assertTransitionTarget } from './transition-targets.mjs';

const NEXT_KIND = Object.freeze({
  STATIC_TARGET: 'static-target',
  STATIC_PARALLEL: 'static-parallel',
  DYNAMIC_TARGET: 'dynamic-target',
  MAPPED: 'mapped',
});

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

export function normalizeTransitionNext(next) {
  if (typeof next === 'string') {
    if (next.includes('${{')) return { kind: NEXT_KIND.DYNAMIC_TARGET, expression: parsePathExpression(next) };
    return { kind: NEXT_KIND.STATIC_TARGET, target: next };
  }

  if (Array.isArray(next)) return { kind: NEXT_KIND.STATIC_PARALLEL, targets: next };
  return { kind: NEXT_KIND.MAPPED, by: next.by, map: next.map };
}

export function isStaticParallelNext(next) {
  if (next === undefined) return false;
  return normalizeTransitionNext(next).kind === NEXT_KIND.STATIC_PARALLEL;
}

export function isDynamicTransitionNext(next) {
  if (next === undefined) return false;
  return normalizeTransitionNext(next).kind === NEXT_KIND.DYNAMIC_TARGET;
}

export function assertTransitionDescriptorTargets(workflow, stepId, descriptor = normalizeTransitionNext(workflow.steps[stepId].next)) {
  if (descriptor.kind === NEXT_KIND.STATIC_TARGET) {
    assertTransitionTarget(workflow, stepId, 'next', descriptor.target);
    return;
  }

  if (descriptor.kind === NEXT_KIND.STATIC_PARALLEL) {
    assertParallelTargets(workflow, stepId, descriptor.targets);
    return;
  }

  if (descriptor.kind === NEXT_KIND.DYNAMIC_TARGET) return;

  for (const [value, target] of Object.entries(descriptor.map)) {
    const path = `next.map.${value}`;
    if (typeof target === 'string') {
      assertTransitionTarget(workflow, stepId, path, target);
      continue;
    }

    assertTransitionTarget(workflow, stepId, `${path}.target`, target.target);
    assertTransitionTarget(workflow, stepId, `${path}.onLimit`, target.onLimit);
  }
}

function assertResolvedTransitionTargets(workflow, stepId, resolved) {
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

function resolveDynamicDescriptor({ workflow, baton, stepId, step, output, descriptor }) {
  const input = contextInputForStep(baton, step, stepId);
  const resolved = readPath({ output, input }, descriptor.expression);
  return assertResolvedTransitionTargets(workflow, stepId, resolved);
}

function resolveMappedDescriptor({ baton, stepId, output, descriptor }) {
  const fieldValue = readTransitionField(output, descriptor.by, stepId);
  invariant(Object.hasOwn(descriptor.map, fieldValue), `transition value '${fieldValue}' is not allowed from cursor '${stepId}' by '${descriptor.by}'`);

  const target = descriptor.map[fieldValue];
  if (typeof target === 'string') return { targetStepId: target };
  return resolveRetryPolicy({ baton, stepId, by: descriptor.by, value: fieldValue, policy: target });
}

export function resolveTransition({ workflow, baton, stepId, step, output }) {
  requireObject(output, 'worker output');
  invariant(step.kind !== 'done' && step.kind !== 'blocked', `cursor '${stepId}' is terminal and cannot be applied`);
  validateOutputKind(step, output, stepId);

  const descriptor = normalizeTransitionNext(step.next);
  if (descriptor.kind === NEXT_KIND.STATIC_TARGET) return { targetStepId: descriptor.target };
  if (descriptor.kind === NEXT_KIND.STATIC_PARALLEL) return { targetStepIds: structuredClone(descriptor.targets) };
  if (descriptor.kind === NEXT_KIND.DYNAMIC_TARGET) return resolveDynamicDescriptor({ workflow, baton, stepId, step, output, descriptor });
  return resolveMappedDescriptor({ baton, stepId, output, descriptor });
}
