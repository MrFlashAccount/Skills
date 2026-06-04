import { invariant } from '../errors.mjs';
import { parsePathExpression } from './Step/expressions/index.mjs';
import { assertParallelTargets, assertTransitionTarget } from './Step/transition-targets.mjs';

const NEXT_KIND = Object.freeze({
  STATIC_TARGET: 'static-target',
  STATIC_PARALLEL: 'static-parallel',
  DYNAMIC_TARGET: 'dynamic-target',
  MATCH_CASES: 'match-cases',
  PARALLEL_ITEMS: 'parallel-items',
});

function workflowData(workflow) {
  return typeof workflow?.toJSON === 'function' ? workflow.toJSON() : workflow;
}

function normalizeTransitionItem(item) {
  invariant(!Array.isArray(item), 'top-level next array items must be strings or match/cases objects');
  if (typeof item === 'string') {
    if (item.includes('${{')) return { kind: NEXT_KIND.DYNAMIC_TARGET, expression: parsePathExpression(item) };
    return { kind: NEXT_KIND.STATIC_TARGET, target: item };
  }

  return { kind: NEXT_KIND.MATCH_CASES, expression: parsePathExpression(item.match), cases: item.cases };
}

export function normalizeTransitionNext(next) {
  if (Array.isArray(next)) {
    const items = next.map((item) => normalizeTransitionItem(item));
    if (items.every((item) => item.kind === NEXT_KIND.STATIC_TARGET)) {
      return { kind: NEXT_KIND.STATIC_PARALLEL, targets: items.map((item) => item.target) };
    }
    return { kind: NEXT_KIND.PARALLEL_ITEMS, items };
  }

  return normalizeTransitionItem(next);
}

export function isStaticParallelNext(next) {
  if (next === undefined) return false;
  return normalizeTransitionNext(next).kind === NEXT_KIND.STATIC_PARALLEL;
}

export function isDynamicTransitionNext(next) {
  if (next === undefined) return false;
  const kind = normalizeTransitionNext(next).kind;
  return kind === NEXT_KIND.DYNAMIC_TARGET || kind === NEXT_KIND.MATCH_CASES || kind === NEXT_KIND.PARALLEL_ITEMS;
}

function isMatchCasesObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'match' in value && 'cases' in value;
}

export function assertNoNestedMatchCasesTarget(target, fieldPath) {
  invariant(!isMatchCasesObject(target), `nested match/cases transitions are not supported at ${fieldPath}`);

  if (!Array.isArray(target)) return;
  for (const [index, item] of target.entries()) {
    invariant(!isMatchCasesObject(item), `nested match/cases transitions are not supported at ${fieldPath}.${index}`);
  }
}

function assertMatchCasesTargets(workflow, stepId, descriptor, fieldPath = 'next') {
  for (const [value, target] of Object.entries(descriptor.cases)) {
    const path = `${fieldPath}.cases.${value}`;
    assertNoNestedMatchCasesTarget(target, path);
    if (typeof target === 'string') {
      assertTransitionTarget(workflow, stepId, path, target);
      continue;
    }

    assertParallelTargets(workflow, stepId, target, path);
  }
}

export function assertTransitionDescriptorTargets(workflowInput, stepId, descriptor = normalizeTransitionNext(workflowData(workflowInput).steps[stepId].next)) {
  const workflow = workflowData(workflowInput);
  if (descriptor.kind === NEXT_KIND.STATIC_TARGET) {
    assertTransitionTarget(workflow, stepId, 'next', descriptor.target);
    return;
  }

  if (descriptor.kind === NEXT_KIND.STATIC_PARALLEL) {
    assertParallelTargets(workflow, stepId, descriptor.targets);
    return;
  }

  if (descriptor.kind === NEXT_KIND.DYNAMIC_TARGET) return;

  if (descriptor.kind === NEXT_KIND.MATCH_CASES) {
    assertMatchCasesTargets(workflow, stepId, descriptor);
    return;
  }

  for (const [index, item] of descriptor.items.entries()) {
    const path = `next.${index}`;
    if (item.kind === NEXT_KIND.STATIC_TARGET) {
      assertTransitionTarget(workflow, stepId, path, item.target);
      continue;
    }
    if (item.kind === NEXT_KIND.MATCH_CASES) assertMatchCasesTargets(workflow, stepId, item, path);
  }
}

export { NEXT_KIND };
