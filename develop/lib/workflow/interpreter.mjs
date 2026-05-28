import { readFileSync } from 'node:fs';
import { buildDirective, buildParallelDirective } from './directive.mjs';
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

function parallelDirectiveForBaton(workflow, baton, cursorStep) {
  const pending = baton.parallel;
  if (!pending) return undefined;
  invariant(pending.from === baton.cursor, `pending parallel branch '${pending.from}' does not match baton cursor '${baton.cursor}'`);
  return buildParallelDirective(baton.cursor, cursorStep, workflow, pending.targets);
}

function responseFor(baton, stepId, step, workflow) {
  const directive = workflow ? (parallelDirectiveForBaton(workflow, baton, step) ?? buildDirective(stepId, step)) : buildDirective(stepId, step);
  const response = { baton, directive };
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
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  return responseFor(baton, baton.cursor, cursorStep, workflow);
}

export function renderWorkflow(workflowPath, batonPath, options = {}) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const response = responseFor(baton, baton.cursor, cursorStep, workflow);
  const rendered = {
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
  if (response.directive.action === 'run_parallel') {
    rendered.compiledParallelPrompts = renderParallelBranchPrompts({
      workflowPath,
      workflow,
      baton,
      directive: response.directive,
      repositoryRoot: options.repositoryRoot,
      templateBaseDir: options.templateBaseDir,
      includeDiagnostics: options.includeDiagnostics,
    });
  }
  assertResponseSchema(rendered);
  return rendered;
}

export function renderParallelBranchPrompts({ workflowPath, workflow, baton, directive, repositoryRoot, templateBaseDir, includeDiagnostics = false } = {}) {
  invariant(directive?.action === 'run_parallel', 'parallel branch prompt rendering requires a run_parallel directive');
  return directive.parallel.map((branch) => ({
    id: branch.id,
    action: branch.action,
    step: structuredClone(branch.step),
    compiledPrompt: renderWorkflowPrompt({
      workflowPath,
      workflow,
      baton,
      stepId: branch.id,
      step: branch.step,
      repositoryRoot,
      templateBaseDir,
      includeDiagnostics,
    }),
  }));
}


function prepareParallelBranch({ workflow, baton, stepId, step, output, attempts }) {
  const join = workflow.steps[step.next[0]].next;
  const updatedBaton = structuredClone(baton);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, output, attempts, step.kind === 'worker' ? stepId : undefined, {
    mirrorToOutputs: Boolean(step.output?.schema),
  });
  updatedBaton.parallel = { from: stepId, targets: structuredClone(step.next), join };
  updatedBaton.status = 'running';
  delete updatedBaton.blocker;
  return responseFor(updatedBaton, stepId, step, workflow);
}

function readParallelOutputForStep(allOutput, stepId) {
  invariant(allOutput && typeof allOutput === 'object' && !Array.isArray(allOutput), 'parallel output must be an object');
  const steps = allOutput.steps;
  invariant(steps && typeof steps === 'object' && !Array.isArray(steps), 'parallel output must include object steps');
  invariant(Object.hasOwn(steps, stepId), `parallel output missing step '${stepId}'`);
  return steps[stepId];
}

function assertParallelOutputShape(pending, allOutput) {
  const steps = allOutput?.steps;
  invariant(steps && typeof steps === 'object' && !Array.isArray(steps), 'parallel output must include object steps');
  const expected = new Set(pending.targets);
  for (const stepId of Object.keys(steps)) {
    invariant(expected.has(stepId), `parallel output included unexpected step '${stepId}'`);
  }
}

function applyParallelOutputs({ workflowPath, workflow, baton, outputPath }) {
  const pending = baton.parallel;
  invariant(pending, `cursor '${baton.cursor}' has no pending parallel steps`);
  const allOutput = readJson(outputPath, 'parallel output');
  assertParallelOutputShape(pending, allOutput);

  let updatedBaton = structuredClone(baton);
  for (const stepId of pending.targets) {
    const step = workflow.steps[stepId];
    const rawOutput = readParallelOutputForStep(allOutput, stepId);
    const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
      workflowPath,
      workflow,
      baton: updatedBaton,
      stepId,
      step,
      workerOutput: rawOutput,
    });
    invariant(!retryResponse, `parallel step '${stepId}' output failed schema validation and cannot be retried inside a parallel group`);
    validateOutputKindForParallel(step, workerOutput, stepId);
    updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, undefined, step.kind === 'worker' ? stepId : undefined, {
      mirrorToOutputs: Boolean(step.output?.schema),
    });
    if (workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;
  }

  const targetStepId = pending.join;
  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  delete updatedBaton.parallel;
  if (updatedBaton.status !== 'blocked') delete updatedBaton.blocker;
  return responseFor(updatedBaton, targetStepId, targetStep, workflow);
}

function validateOutputKindForParallel(step, output, stepId) {
  if (step.kind === 'approval') {
    invariant(!('outcome' in output), `approval cursor '${stepId}' must use approval, not outcome`);
    invariant('approval' in output, `approval cursor '${stepId}' must include string approval`);
    return;
  }

  if (step.kind === 'worker') {
    invariant(!('approval' in output), `worker cursor '${stepId}' must use outcome, not approval`);
    invariant('outcome' in output, `worker cursor '${stepId}' must include string outcome`);
  }
}

export function applyWorkflowOutput(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  if (baton.parallel) return applyParallelOutputs({ workflowPath, workflow, baton, outputPath });

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

  if (Array.isArray(cursorStep.next)) {
    return prepareParallelBranch({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput, attempts: undefined });
  }

  const { targetStepId, attempts } = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: workerOutput });
  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);

  const updatedBaton = structuredClone(baton);
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, attempts, cursorStep.kind === 'worker' ? baton.cursor : undefined, {
    mirrorToOutputs: Boolean(cursorStep.output?.schema),
  });
  delete updatedBaton.blocker;
  if (updatedBaton.status === 'blocked' && workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;

  return responseFor(updatedBaton, targetStepId, targetStep, workflow);
}
