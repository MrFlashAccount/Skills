import { invariant } from '../../../entities/Workflow/errors.mjs';
import { statusForStep } from '../../../entities/Step/model.mjs';
import { applyOutputToBatonState } from '../../../entities/Baton/state.mjs';
import { responseFor } from '../output/response.mjs';
import { assertOutputSchemaIfDeclared } from '../output/worker-output.mjs';
import { joinForParallelTargets } from '../../../entities/Workflow/transition-targets.mjs';
import { shouldMarkUserPromptInjectedForStep, validateSelectedStartupUserPromptTarget } from '../../../entities/Baton/user-prompt.mjs';

function readParallelOutputForStep(allOutput, stepId) {
  invariant(allOutput && typeof allOutput === 'object' && !Array.isArray(allOutput), 'parallel output must be an object');
  const steps = allOutput.steps;
  invariant(steps && typeof steps === 'object' && !Array.isArray(steps), 'parallel output must include object steps');
  invariant(Object.hasOwn(steps, stepId), `parallel output missing step '${stepId}'`);
  return steps[stepId];
}

function parallelTargetsForStep(step, targets) {
  if (targets) return targets;
  invariant(Array.isArray(step.next), 'parallel output can only be applied at a cursor with array next');
  return step.next;
}

function assertParallelOutputShape(targets, allOutput) {
  const steps = allOutput?.steps;
  invariant(steps && typeof steps === 'object' && !Array.isArray(steps), 'parallel output must include object steps');
  const expected = new Set(targets);
  for (const stepId of Object.keys(steps)) {
    invariant(expected.has(stepId), `parallel output included unexpected step '${stepId}'`);
  }
}

function validateOutputKindForParallel(step, output, stepId) {
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

export function applyParallelOutputs({ workflowPath, workflow, baton, cursorStep, outputPath, allOutput, targets: resolvedTargets, repositoryRoot, readJson, loadOutputSchema }) {
  const targets = parallelTargetsForStep(cursorStep, resolvedTargets);
  const parallelOutput = allOutput ?? readJson(outputPath, 'parallel output');
  assertParallelOutputShape(targets, parallelOutput);

  let updatedBaton = structuredClone(baton);
  const promptRecipientStepId = targets.find((stepId) => shouldMarkUserPromptInjectedForStep({
    workflow,
    baton,
    stepId,
  }));
  if (promptRecipientStepId) updatedBaton.user_prompt_injected = true;

  for (const stepId of targets) {
    const step = workflow.steps[stepId];
    const rawOutput = readParallelOutputForStep(parallelOutput, stepId);
    const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
      workflowPath,
      workflow,
      baton: updatedBaton,
      stepId,
      step,
      workerOutput: rawOutput,
      repositoryRoot,
      loadOutputSchema,
    });
    invariant(!retryResponse, `parallel step '${stepId}' output failed schema validation and cannot be retried inside a parallel group`);
    validateOutputKindForParallel(step, workerOutput, stepId);
    updatedBaton.state = applyOutputToBatonState(updatedBaton, workerOutput, undefined, ['worker', 'approval'].includes(step.kind) ? stepId : undefined, {
      mirrorToOutputs: Boolean(step.output?.schema),
    });
    if (workerOutput.blocker) updatedBaton.blocker = workerOutput.blocker;
  }

  const targetStepId = joinForParallelTargets(workflow, targets);
  const targetStep = workflow.steps[targetStepId];
  invariant(targetStep, `transition target not found in workflow: ${targetStepId}`);
  updatedBaton = validateSelectedStartupUserPromptTarget({
    workflow,
    baton: updatedBaton,
    steps: [{ id: targetStepId, step: targetStep }],
  });
  updatedBaton.cursor = targetStepId;
  updatedBaton.status = statusForStep(workflow, targetStepId, targetStep);
  if (updatedBaton.status !== 'blocked') delete updatedBaton.blocker;
  return responseFor(updatedBaton, targetStepId, targetStep, workflow);
}
