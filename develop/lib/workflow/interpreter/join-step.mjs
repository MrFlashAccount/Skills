import { invariant } from '../errors.mjs';
import { statusForStep } from '../model.mjs';
import { readJson } from '../json-io.mjs';
import { applyOutputToBatonState } from '../state.mjs';
import { responseFor } from './run-step.mjs';
import { assertOutputSchemaIfDeclared } from './apply-output.mjs';

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

export function applyParallelOutputs({ workflowPath, workflow, baton, outputPath }) {
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
