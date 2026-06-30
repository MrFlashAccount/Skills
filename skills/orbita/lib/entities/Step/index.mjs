/**
 * Step entity owns step-level transition input context, transition descriptors,
 * concrete transition resolution, and output application intent.
 */
import { readPath } from './expressions/index.mjs';
import { invariant } from '../../errors.mjs';
import { applyOutputToBatonState } from '../../runtime/baton-state.mjs';
import { selectState } from '../../runtime/state-selection.mjs';
import { statusForStep } from '../../runtime/step-status.mjs';
import { assertParallelTargets, assertTransitionTarget } from '../../runtime/transition-targets.mjs';
import {
  assertNoNestedMatchCasesTarget,
  assertTransitionDescriptorTargets,
  isDynamicTransitionNext,
  isStaticParallelNext,
  NEXT_KIND,
  normalizeTransitionNext,
} from '../../runtime/transition-next.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

function workflowData(workflow) {
  return typeof workflow?.toJSON === 'function' ? workflow.toJSON() : workflow;
}

function requireObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
}

function requestStepIds(requests = []) {
  return requests
    .map((request) => request?.stepId ?? request?.id)
    .filter((stepId, index, values) => typeof stepId === 'string' && stepId.length > 0 && values.indexOf(stepId) === index);
}

function staleCurrentRequestMessage(stepId, requests = []) {
  const current = requestStepIds(requests);
  const currentText = current.length > 0 ? current.join(', ') : 'none';
  return `stale workflow-runner command from an older response: requested step '${stepId}' is no longer valid for the current workflow state (current request step ids: ${currentText}). Use the latest workflow-runner response/instructions.`;
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

function addExpressionInputSelector(selectors, expression) {
  if (expression?.root !== 'input') return;
  const [stepId] = expression.path;
  if (typeof stepId === 'string' && !selectors.includes(stepId)) selectors.push(stepId);
}

function transitionInputSelectors(descriptor) {
  const selectors = [];
  if (descriptor.kind === NEXT_KIND.DYNAMIC_TARGET || descriptor.kind === NEXT_KIND.MATCH_CASES) {
    addExpressionInputSelector(selectors, descriptor.expression);
    return selectors;
  }
  if (descriptor.kind === NEXT_KIND.PARALLEL_ITEMS) {
    for (const item of descriptor.items) {
      if (item.kind === NEXT_KIND.DYNAMIC_TARGET || item.kind === NEXT_KIND.MATCH_CASES) addExpressionInputSelector(selectors, item.expression);
    }
  }
  return selectors;
}

function contextInputForStep(baton, selectors, stepId) {
  return selectState({ batonState: baton.state ?? {}, selectors, stepId }).value;
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
  const input = contextInputForStep(baton, transitionInputSelectors(descriptor), stepId);
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
    const descriptor = Object.hasOwn(this.data, 'next') ? normalizeTransitionNext(this.data.next) : undefined;
    return contextInputForStep(baton, descriptor ? transitionInputSelectors(descriptor) : [], this.id);
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
    invariant(request, staleCurrentRequestMessage(stepId, requests));

    const requestStepId = request.stepId ?? request.id;
    invariant(typeof requestStepId === 'string' && requestStepId.length > 0, staleCurrentRequestMessage(stepId, requests));
    invariant(workflowDoc.steps?.[requestStepId], staleCurrentRequestMessage(stepId, requests));

    if (requestStepId === this.id) return { ok: true, stepId: requestStepId };
    if (batonData?.state && Object.hasOwn(batonData.state, this.id) && Object.hasOwn(this.data, 'next')) {
      const resolved = this.resolveConcreteTargets(batonData, workflowDoc, batonData.state[this.id]);
      if (resolved.targetStepIds?.includes(requestStepId)) return { ok: true, stepId: requestStepId };
    }

    throw new Error(staleCurrentRequestMessage(stepId, requests));
  }

  prepareRenderContext({ workflow, baton, userPrompt } = {}) {
    return { workflow: workflowData(workflow), baton, stepId: this.id, step: this.toJSON(), input: this.resolveInputs(baton), userPrompt };
  }

  applyOutput({ baton, output, workflow, attempts, storeStepOutput = ['worker', 'approval'].includes(this.data.kind) } = {}) {
    const wf = workflowData(workflow);
    const transition = this.resolveConcreteTargets(baton, wf, output);
    const batonData = cloneBoundaryData(baton);
    const outputStepId = storeStepOutput ? this.id : undefined;
    const withOutput = {
      ...batonData,
      state: applyOutputToBatonState(batonData, output, attempts ?? transition.attempts, outputStepId),
    };

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
