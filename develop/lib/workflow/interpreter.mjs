import { buildDirective } from './directive.mjs';
import { invariant } from './errors.mjs';
import { rejectLegacyWorkflowVocabulary } from './legacy-vocabulary.mjs';
import { validateWorkflowModel, statusForStep } from './model.mjs';
import { readJson } from './json-io.mjs';
import { assertBatonSchema, assertResponseSchema, assertWorkflowSchema, assertWorkerOutputSchema } from './schema-validation.mjs';
import { applyOutputToBatonState } from './state.mjs';
import { resolveTransition } from './transitions.mjs';

export function loadWorkflowAndBaton(workflowPath, batonPath) {
  const workflowDoc = readJson(workflowPath, 'workflow');
  const baton = readJson(batonPath, 'baton');

  rejectLegacyWorkflowVocabulary(workflowDoc);
  assertWorkflowSchema(workflowDoc);
  assertBatonSchema(baton);

  const workflow = workflowDoc.workflow;
  validateWorkflowModel(workflow);

  const cursorStep = workflow.steps[baton.cursor];
  invariant(cursorStep, `baton cursor not found in workflow: ${baton.cursor}`);

  return { workflow, baton, cursorStep };
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
  if (workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  return responseFor(updatedBaton, targetStepId, targetStep);
}
