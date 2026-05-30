import { invariant } from '../../errors.mjs';
import { statusForStep } from '../../model.mjs';
import { readJson } from '../../json-io.mjs';
import { assertNoReservedWorkflowStepIds } from '../../reserved-state.mjs';
import { assertBatonSchema, assertWorkflowSchema } from '../../schema-validation.mjs';
import { assertProjectableStateSelector, isReservedStateKey, RESERVED_STEP_IDS } from '../../state-keys.mjs';
import { assertTransitionDescriptorTargets, normalizeTransitionNext } from '../../transitions.mjs';

function assertLoadedWorkflowAndBaton(workflowDoc, baton, workflowPath) {
  assertWorkflowSchema(workflowDoc);
  assertBatonSchema(baton);

  const workflow = workflowDoc;
  assertNoReservedWorkflowStepIds(workflow);
  assertWorkflowRootTargets(workflow);
  assertWorkflowRuntimeStateBoundary(workflow);
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

export function loadWorkflowAndBaton(workflowPath, batonPath) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  const baton = readJson(batonPath, 'baton');

  return assertLoadedWorkflowAndBaton(workflowDoc, baton, workflowPath);
}

export function loadWorkflowWithBaton(workflowPath, baton) {
  const workflowDoc = readJson(workflowPath, 'workflow');

  return assertLoadedWorkflowAndBaton(workflowDoc, baton, workflowPath);
}

function assertWorkflowRuntimeStateBoundary(workflow) {
  for (const [stepId, step] of Object.entries(workflow.steps)) {
    invariant(
      !isReservedStateKey(stepId),
      `workflow step id '${stepId}' is reserved for runtime aggregate state; reserved ids: ${RESERVED_STEP_IDS.join(', ')}`,
    );

    for (const selector of step.input?.state ?? []) {
      try {
        assertProjectableStateSelector(selector, { stepId, errorPrefix: 'workflow runtime validation failed' });
      } catch (error) {
        if (error instanceof Error) invariant(false, error.message);
        throw error;
      }
      invariant(
        Object.hasOwn(workflow.steps, selector),
        `workflow runtime validation failed: step '${stepId}' input.state selector '${selector}' does not reference a declared workflow step`,
      );
    }
  }
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

    const descriptor = normalizeTransitionNext(step.next);
    assertTransitionDescriptorTargets(workflow, stepId, descriptor);
  }
}
