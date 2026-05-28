import { invariant } from '../errors.mjs';
import { statusForStep } from '../model.mjs';
import { readJson } from '../json-io.mjs';
import { assertBatonSchema, assertWorkflowSchema } from '../schema-validation.mjs';

export function loadWorkflowAndBaton(workflowPath, batonPath) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  const baton = readJson(batonPath, 'baton');

  assertWorkflowSchema(workflowDoc);
  assertBatonSchema(baton);

  const workflow = workflowDoc.workflow;
  assertWorkflowRootTargets(workflow);
  assertWorkflowTransitionTargets(workflow);

  const cursorStep = workflow.steps[baton.cursor];
  invariant(cursorStep, `baton cursor not found in workflow: ${baton.cursor}`);

  const expectedStatus = statusForStep(workflow, baton.cursor, cursorStep);
  invariant(
    baton.status === expectedStatus,
    `baton status '${baton.status}' is inconsistent with cursor '${baton.cursor}'; expected '${expectedStatus}'`,
  );

  return { workflow, baton, cursorStep };
}

function assertWorkflowRootTargets(workflow) {
  const startStep = workflow.steps[workflow.start];
  invariant(startStep, `workflow start target not found: ${workflow.start}`);

  const doneStep = workflow.steps[workflow.done];
  invariant(doneStep, `workflow done target not found: ${workflow.done}`);
  invariant(doneStep.kind === 'done', `workflow done target '${workflow.done}' must be a done step`);

  const blockedStep = workflow.steps[workflow.blocked];
  invariant(blockedStep, `workflow blocked target not found: ${workflow.blocked}`);
  invariant(blockedStep.kind === 'blocked', `workflow blocked target '${workflow.blocked}' must be a blocked step`);
}

function assertWorkflowTransitionTargets(workflow) {
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    if (!Object.hasOwn(step, 'next')) continue;

    const next = step.next;
    if (typeof next === 'string') {
      assertTransitionTarget(workflow, stepId, 'next', next);
      continue;
    }

    if (Array.isArray(next)) {
      assertParallelTargets(workflow, stepId, next);
      continue;
    }

    for (const [value, target] of Object.entries(next.map)) {
      const path = `next.map.${value}`;
      if (typeof target === 'string') {
        assertTransitionTarget(workflow, stepId, path, target);
        continue;
      }

      assertTransitionTarget(workflow, stepId, `${path}.target`, target.target);
      assertTransitionTarget(workflow, stepId, `${path}.onLimit`, target.onLimit);
    }
  }
}

function assertTransitionTarget(workflow, stepId, fieldPath, targetStepId) {
  invariant(
    Object.hasOwn(workflow.steps, targetStepId),
    `workflow step '${stepId}' transition '${fieldPath}' target not found: ${targetStepId}`,
  );
}

function assertParallelTargets(workflow, stepId, targets) {
  const joinTargets = new Set();
  for (const targetStepId of targets) {
    assertTransitionTarget(workflow, stepId, 'next', targetStepId);
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
