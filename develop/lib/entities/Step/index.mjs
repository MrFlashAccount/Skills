/**
 * Step entity owns step-level input projection, transition descriptors,
 * concrete transition resolution, and output application intent.
 */
import { parsePathExpression, readPath } from './expressions/index.mjs';
import { invariant } from '../../errors.mjs';
import { projectState } from './projection.mjs';
import { assertParallelTargets, assertTransitionTarget } from './transition-targets.mjs';
import { Baton } from '../Baton/index.mjs';
import { statusForStep } from '../Workflow/status.mjs';

const NEXT_KIND = Object.freeze({
  STATIC_TARGET: 'static-target',
  STATIC_PARALLEL: 'static-parallel',
  DYNAMIC_TARGET: 'dynamic-target',
  MATCH_CASES: 'match-cases',
  PARALLEL_ITEMS: 'parallel-items',
});

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

function workflowData(workflow) {
  return typeof workflow?.toJSON === 'function' ? workflow.toJSON() : workflow;
}

function requireObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
}

function validateOutputKind(step, output, stepId) {
  if (step.kind === 'approval') {
    invariant(!('outcome' in output), `approval cursor '${stepId}' must use host/user output fields, not outcome`);
    if ('approval' in output) invariant(typeof output.approval === 'string', `approval cursor '${stepId}' field approval must be a string`);
    return;
  }

  if (step.kind === 'worker') {
    invariant(!('approval' in output), `worker cursor '${stepId}' must use outcome, not approval`);
    invariant(typeof output.outcome === 'string', `worker cursor '${stepId}' must include string outcome`);
  }
}

function contextInputForStep(baton, step, stepId) {
  return projectState({ batonState: baton.state ?? {}, selectors: step.input?.state ?? [], stepId }).value;
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

function assertResolvedTransitionTargets(workflow, stepId, resolved, fieldPath = 'next') {
  if (typeof resolved === 'string') {
    invariant(resolved.length > 0, `workflow step '${stepId}' dynamic next resolved to an empty string`);
    assertTransitionTarget(workflow, stepId, fieldPath, resolved);
    return { targetStepId: resolved };
  }

  if (Array.isArray(resolved)) {
    assertParallelTargets(workflow, stepId, resolved, fieldPath);
    return { targetStepIds: structuredClone(resolved) };
  }

  invariant(false, `workflow step '${stepId}' dynamic next must resolve to a string step id or array of step ids`);
}

function resolveDynamicValue({ baton, stepId, step, output, descriptor }) {
  const input = contextInputForStep(baton, step, stepId);
  return readPath({ output, input }, descriptor.expression);
}

function resolveDynamicDescriptor({ workflow, baton, stepId, step, output, descriptor }) {
  return assertResolvedTransitionTargets(workflow, stepId, resolveDynamicValue({ baton, stepId, step, output, descriptor }));
}

function resolveMatchCasesValue({ baton, stepId, step, output, descriptor }) {
  const caseKey = resolveDynamicValue({ baton, stepId, step, output, descriptor });
  invariant(typeof caseKey === 'string', `workflow step '${stepId}' next.match must resolve to a string case key`);
  invariant(Object.hasOwn(descriptor.cases, caseKey), `workflow step '${stepId}' next.match case '${caseKey}' is not defined in next.cases`);
  const target = descriptor.cases[caseKey];
  assertNoNestedMatchCasesTarget(target, `next.cases.${caseKey}`);
  return target;
}

function resolveMatchCasesDescriptor({ workflow, baton, stepId, step, output, descriptor }) {
  return assertResolvedTransitionTargets(workflow, stepId, resolveMatchCasesValue({ baton, stepId, step, output, descriptor }));
}

function pushResolvedParallelValue(targets, value, stepId) {
  if (typeof value === 'string') {
    targets.push(value);
    return;
  }

  invariant(Array.isArray(value), `workflow step '${stepId}' top-level next array items must resolve to string step ids or flat string arrays`);
  targets.push(...value);
}

function resolveParallelItemsDescriptor({ workflow, baton, stepId, step, output, descriptor }) {
  const targets = [];
  for (const item of descriptor.items) {
    if (item.kind === NEXT_KIND.STATIC_TARGET) {
      targets.push(item.target);
      continue;
    }

    if (item.kind === NEXT_KIND.DYNAMIC_TARGET) {
      pushResolvedParallelValue(targets, resolveDynamicValue({ baton, stepId, step, output, descriptor: item }), stepId);
      continue;
    }

    pushResolvedParallelValue(targets, resolveMatchCasesValue({ baton, stepId, step, output, descriptor: item }), stepId);
  }

  assertParallelTargets(workflow, stepId, targets, 'next');
  return { targetStepIds: structuredClone(targets) };
}

export function resolveTransition({ workflow, baton, stepId, step, output }) {
  const wf = workflowData(workflow);
  requireObject(output, 'worker output');
  invariant(step.kind !== 'done' && step.kind !== 'blocked', `cursor '${stepId}' is terminal and cannot be applied`);
  validateOutputKind(step, output, stepId);

  const descriptor = normalizeTransitionNext(step.next);
  if (descriptor.kind === NEXT_KIND.STATIC_TARGET) return { targetStepId: descriptor.target };
  if (descriptor.kind === NEXT_KIND.STATIC_PARALLEL) return { targetStepIds: structuredClone(descriptor.targets) };
  if (descriptor.kind === NEXT_KIND.DYNAMIC_TARGET) return resolveDynamicDescriptor({ workflow: wf, baton, stepId, step, output, descriptor });
  if (descriptor.kind === NEXT_KIND.MATCH_CASES) return resolveMatchCasesDescriptor({ workflow: wf, baton, stepId, step, output, descriptor });
  return resolveParallelItemsDescriptor({ workflow: wf, baton, stepId, step, output, descriptor });
}

export class Step {
  constructor(stepData) {
    const data = cloneBoundaryData(stepData);
    this.id = data.id;
    this.data = data.step ? { id: data.id, ...data.step } : data;
    Object.freeze(this.data);
  }

  toJSON() {
    const { id, ...step } = this.data;
    return structuredClone(step);
  }

  kind() {
    return this.data.kind;
  }

  resolveInputs(baton) {
    return contextInputForStep(baton, this.data, this.id);
  }

  resolveConcreteTargets(baton, workflow, output = baton?.state?.[this.id]) {
    return resolveTransition({ workflow, baton, stepId: this.id, step: this.data, output });
  }

  validateForRun({ workflow } = {}) {
    if (workflow && Object.hasOwn(this.data, 'next')) assertTransitionDescriptorTargets(workflow, this.id, normalizeTransitionNext(this.data.next));
    return { ok: true };
  }

  validateInstructionRequest({ workflow, baton, runState = {}, stepId } = {}) {
    const batonData = typeof baton?.toJSON === 'function' ? baton.toJSON() : baton;
    const workflowDoc = workflowData(workflow);
    const requests = runState.requests ?? batonData?.requests ?? [];
    const request = requests.find((candidate) => candidate?.stepId === stepId || candidate?.id === stepId);
    invariant(request, `unknown current workflow step id: ${stepId}`);

    const requestStepId = request.stepId ?? request.id;
    invariant(typeof requestStepId === 'string' && requestStepId.length > 0, `unknown current workflow step id: ${stepId}`);
    invariant(workflowDoc.steps?.[requestStepId], `unknown current workflow step id: ${stepId}`);

    if (requestStepId === this.id) return { ok: true, stepId: requestStepId };
    if (batonData?.state && Object.hasOwn(batonData.state, this.id) && Object.hasOwn(this.data, 'next')) {
      const resolved = this.resolveConcreteTargets(batonData, workflowDoc, batonData.state[this.id]);
      if (resolved.targetStepIds?.includes(requestStepId)) return { ok: true, stepId: requestStepId };
    }

    throw new Error(`unknown current workflow step id: ${stepId}`);
  }

  prepareRenderContext({ workflow, baton, userPrompt } = {}) {
    return { workflow: workflowData(workflow), baton, stepId: this.id, step: this.toJSON(), input: this.resolveInputs(baton), userPrompt };
  }

  applyOutput({ baton, output, workflow, attempts, storeStepOutput = ['worker', 'approval'].includes(this.data.kind) } = {}) {
    const wf = workflowData(workflow);
    const transition = this.resolveConcreteTargets(baton, wf, output);
    const stateOwner = new Baton(baton);
    const outputStepId = storeStepOutput ? this.id : undefined;
    const withOutput = stateOwner.withAppliedOutput(outputStepId, output, attempts ?? transition.attempts, {
      mirrorToOutputs: Boolean(this.data.output?.schema),
    });

    if (transition.targetStepIds) {
      return { ...transition, baton: { ...withOutput, status: 'running' } };
    }

    const targetStep = wf.steps?.[transition.targetStepId];
    invariant(targetStep, `transition target not found in workflow: ${transition.targetStepId}`);
    const updatedBaton = {
      ...withOutput,
      cursor: transition.targetStepId,
      status: statusForStep(wf, transition.targetStepId, targetStep),
    };
    delete updatedBaton.blocker;
    if (updatedBaton.status === 'blocked' && output.blocker) updatedBaton.blocker = output.blocker;
    return { ...transition, targetStep, baton: updatedBaton };
  }
}
