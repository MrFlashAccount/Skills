import { buildDirective } from './directive.mjs';
import { invariant } from './errors.mjs';
import { statusForStep } from './model.mjs';
import { readJson } from './json-io.mjs';
import { assertBatonSchema, assertResponseSchema, assertWorkflowSchema, assertWorkerOutputSchema } from './schema-validation.mjs';
import { applyOutputToBatonState } from './state.mjs';
import { resolveTransition } from './transitions.mjs';

export function loadWorkflowAndBaton(workflowPath, batonPath) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  const baton = readJson(batonPath, 'baton');

  assertWorkflowSchema(workflowDoc);
  assertBatonSchema(baton);

  const workflow = workflowDoc.workflow;
  assertWorkflowRootTargets(workflow);

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

function responseFor(baton, stepId, step) {
  const response = { baton, directive: buildDirective(stepId, step) };
  assertResponseSchema(response);
  return response;
}

export function inspectWorkflow(workflowPath, batonPath) {
  const { baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  return responseFor(baton, baton.cursor, cursorStep);
}

export function applyWorkflowOutput(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const workerOutput = readJson(outputPath, 'worker output');
  assertWorkerOutputSchema(workerOutput);

  const { targetStepId, attempts } = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput });
  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);

  const updatedBaton = structuredClone(baton);
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, attempts);
  delete updatedBaton.blocker;
  if (updatedBaton.status === 'blocked' && workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  return responseFor(updatedBaton, targetStepId, targetStep);
}
