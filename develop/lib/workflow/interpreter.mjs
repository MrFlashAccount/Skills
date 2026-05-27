import { readFileSync } from 'node:fs';
import { buildDirective } from './directive.mjs';
import { invariant, WorkflowInterpreterError } from './errors.mjs';
import { statusForStep } from './model.mjs';
import { readJson } from './json-io.mjs';
import { assertBatonSchema, assertResponseSchema, assertWorkflowSchema, assertWorkerOutputSchema } from './schema-validation.mjs';
import { applyOutputToBatonState } from './state.mjs';
import { renderWorkflowPrompt } from './prompt-renderer.mjs';
import { validateAgainstOutputSchema, outputSchemaRetryKey, validationRetryPrompt, OUTPUT_SCHEMA_MAX_ATTEMPTS } from './output-schema-validation.mjs';
import { resolveTransition } from './transitions.mjs';

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

function responseFor(baton, stepId, step) {
  const response = { baton, directive: buildDirective(stepId, step) };
  assertResponseSchema(response);
  return response;
}

function stepWithValidationFeedback(step, feedbackPrompt) {
  const updatedStep = structuredClone(step);
  updatedStep.input = {
    ...(updatedStep.input ?? {}),
    prompt: [updatedStep.input?.prompt, feedbackPrompt].filter(Boolean).join('\n\n'),
  };
  return updatedStep;
}

function responseForOutputSchemaRetry({ baton, stepId, step, errors, attempt }) {
  const updatedBaton = structuredClone(baton);
  updatedBaton.state = {
    ...updatedBaton.state,
    attempts: {
      ...(updatedBaton.state?.attempts ?? {}),
      [outputSchemaRetryKey(stepId)]: attempt,
    },
  };
  delete updatedBaton.blocker;
  const feedbackPrompt = validationRetryPrompt({ errors, attempt });
  return responseFor(updatedBaton, stepId, stepWithValidationFeedback(step, feedbackPrompt));
}


function invalidJsonOutputRetry({ baton, stepId, step, error }) {
  const attempt = (baton.state?.attempts?.[outputSchemaRetryKey(stepId)] ?? 0) + 1;
  const errors = `worker output is not valid JSON: ${error.message}`;
  if (attempt >= OUTPUT_SCHEMA_MAX_ATTEMPTS) {
    throw new WorkflowInterpreterError(
      `output schema validation failed for step '${stepId}' after ${OUTPUT_SCHEMA_MAX_ATTEMPTS} attempts: ${errors}`,
    );
  }
  return responseForOutputSchemaRetry({ baton, stepId, step, errors, attempt });
}

function readWorkerOutputForStep({ outputPath, baton, stepId, step }) {
  if (!step.output?.schema) return { workerOutput: readJson(outputPath, 'worker output'), retryResponse: undefined };
  try {
    return { workerOutput: JSON.parse(readFileSync(outputPath, 'utf8')), retryResponse: undefined };
  } catch (error) {
    return { workerOutput: undefined, retryResponse: invalidJsonOutputRetry({ baton, stepId, step, error }) };
  }
}

function assertOutputSchemaIfDeclared({ workflowPath, workflow, baton, stepId, step, workerOutput }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) {
    assertWorkerOutputSchema(workerOutput);
    return { workerOutput, retryResponse: undefined };
  }

  const validation = validateAgainstOutputSchema({ workflow, workflowPath, schemaRef, output: workerOutput });
  if (validation.ok) return { workerOutput: validation.output, retryResponse: undefined };

  const attempt = (baton.state?.attempts?.[outputSchemaRetryKey(stepId)] ?? 0) + 1;
  if (attempt >= OUTPUT_SCHEMA_MAX_ATTEMPTS) {
    throw new WorkflowInterpreterError(
      `output schema validation failed for step '${stepId}' after ${OUTPUT_SCHEMA_MAX_ATTEMPTS} attempts: ${validation.errors}`,
    );
  }

  return {
    workerOutput,
    retryResponse: responseForOutputSchemaRetry({ baton, stepId, step, errors: validation.errors, attempt }),
  };
}

export function inspectWorkflow(workflowPath, batonPath) {
  const { baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  return responseFor(baton, baton.cursor, cursorStep);
}

export function renderWorkflow(workflowPath, batonPath, options = {}) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const response = responseFor(baton, baton.cursor, cursorStep);
  return {
    ...response,
    compiledPrompt: renderWorkflowPrompt({
      workflowPath,
      workflow,
      baton,
      stepId: baton.cursor,
      step: cursorStep,
      repositoryRoot: options.repositoryRoot,
      templateBaseDir: options.templateBaseDir,
      includeDiagnostics: options.includeDiagnostics,
    }),
  };
}

export function applyWorkflowOutput(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const readResult = readWorkerOutputForStep({ outputPath, baton, stepId: baton.cursor, step: cursorStep });
  if (readResult.retryResponse) return readResult.retryResponse;
  const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
    workflowPath,
    workflow,
    baton,
    stepId: baton.cursor,
    step: cursorStep,
    workerOutput: readResult.workerOutput,
  });
  if (retryResponse) return retryResponse;

  const { targetStepId, attempts } = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput });
  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);

  const updatedBaton = structuredClone(baton);
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, attempts, cursorStep.output?.schema ? baton.cursor : undefined);
  delete updatedBaton.blocker;
  if (updatedBaton.status === 'blocked' && workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  return responseFor(updatedBaton, targetStepId, targetStep);
}
