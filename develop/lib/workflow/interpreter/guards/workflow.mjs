import { invariant } from '../../errors.mjs';
import { statusForStep } from '../../model.mjs';
import { readJson } from '../../json-io.mjs';
import { isExpressionString, parsePathExpression } from '../../expressions/index.mjs';
import { assertBatonSchema, assertWorkflowSchema } from '../../schema-validation.mjs';
import { assertParallelTargets, assertTransitionTarget } from '../parallel/targets.mjs';

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
      if (isExpressionString(next)) parsePathExpression(next);
      else assertTransitionTarget(workflow, stepId, 'next', next);
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
