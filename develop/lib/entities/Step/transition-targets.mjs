import { invariant } from '../../errors.mjs';

export function assertTransitionTarget(workflow, stepId, fieldPath, targetStepId) {
  invariant(
    Object.hasOwn(workflow.steps, targetStepId),
    `workflow step '${stepId}' transition '${fieldPath}' target not found: ${targetStepId}`,
  );
}

export function assertParallelTargets(workflow, stepId, targets, fieldPath = 'next') {
  invariant(Array.isArray(targets), `workflow step '${stepId}' ${fieldPath} must resolve to an array of step ids`);
  invariant(targets.length > 0, `workflow step '${stepId}' ${fieldPath} must resolve to a non-empty array`);

  const seenTargets = new Set();
  const joinTargets = new Set();
  for (const targetStepId of targets) {
    invariant(typeof targetStepId === 'string' && targetStepId.length > 0, `workflow step '${stepId}' ${fieldPath} must resolve to non-empty string step ids`);
    invariant(!seenTargets.has(targetStepId), `workflow step '${stepId}' ${fieldPath} includes duplicate target '${targetStepId}'`);
    seenTargets.add(targetStepId);
    assertTransitionTarget(workflow, stepId, fieldPath, targetStepId);
    invariant(targetStepId !== stepId, `workflow step '${stepId}' parallel branch cannot target itself`);

    const targetStep = workflow.steps[targetStepId];
    invariant(
      targetStep.kind !== 'done' && targetStep.kind !== 'blocked',
      `workflow step '${stepId}' parallel branch target '${targetStepId}' cannot be terminal`,
    );
    invariant(
      !Array.isArray(targetStep.next),
      `workflow step '${stepId}' parallel branch target '${targetStepId}' cannot start nested parallel steps`,
    );
    invariant(
      typeof targetStep.next === 'string',
      `workflow step '${stepId}' parallel branch target '${targetStepId}' must use a string next to an explicit join step`,
    );
    assertTransitionTarget(workflow, targetStepId, 'next', targetStep.next);
    joinTargets.add(targetStep.next);
  }

  invariant(joinTargets.size === 1, `workflow step '${stepId}' parallel branch targets must share one explicit join step`);
}

export function joinForParallelTargets(workflow, targets) {
  const firstTarget = targets[0];
  const join = workflow.steps[firstTarget]?.next;
  invariant(typeof join === 'string', `parallel branch target '${firstTarget}' must use a string next to an explicit join step`);
  return join;
}
