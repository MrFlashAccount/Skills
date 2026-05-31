import { assertRuntimeWorkflowState, isStaticParallelRuntimeStep, prepareWorkflowRuntimeStep } from './workflow-runtime-state.mjs';

function requireDependency(dependencies, name) {
  const dependency = dependencies[name];
  if (typeof dependency !== 'function') throw new Error(`${name} dependency is required`);
  return dependency;
}

function outputPathLabel(outputPath) {
  return outputPath ?? '<provided output>';
}

/** Applies one host/worker output DTO to a workflow+baton DTO pair through boundary adapters. */
export function applyWorkflowOutput({
  workflow,
  baton,
  outputValue,
  outputParseError,
  outputPath,
  readStepOutput,
  validateStepOutput,
  isParallelOutputEnvelope,
  applyParallelBranchOutput,
  prepareParallelBranch,
  applyNextTransition,
  runtime,
}) {
  const workflowRuntime = assertRuntimeWorkflowState({ workflow, baton, runtime });
  const readOutput = requireDependency({ readStepOutput }, 'readStepOutput');
  const validateOutput = requireDependency({ validateStepOutput }, 'validateStepOutput');
  const isParallelEnvelope = requireDependency({ isParallelOutputEnvelope }, 'isParallelOutputEnvelope');
  const applyParallelOutput = requireDependency({ applyParallelBranchOutput }, 'applyParallelBranchOutput');
  const prepareBranch = requireDependency({ prepareParallelBranch }, 'prepareParallelBranch');
  const applyNext = requireDependency({ applyNextTransition }, 'applyNextTransition');
  const sourceLabel = outputPathLabel(outputPath);

  const prepared = prepareWorkflowRuntimeStep({ workflow, baton: workflowRuntime.baton, runtime });
  if (prepared.parallelTargets) {
    if (!isParallelEnvelope(outputValue)) throw new Error('parallel output must include object steps');
    return applyParallelOutput({
      workflow,
      baton: workflowRuntime.baton,
      step: prepared.step,
      outputPath: sourceLabel,
      outputValue,
      targets: Array.isArray(prepared.step.next) ? undefined : prepared.step.next,
    });
  }

  const readResult = readOutput({
    sourceLabel,
    baton: workflowRuntime.baton,
    stepId: workflowRuntime.baton.cursor,
    step: workflowRuntime.cursorStep,
    outputValue,
    outputParseError,
  });
  if (readResult.retryResponse) return readResult.retryResponse;

  const { workerOutput, retryResponse } = validateOutput({
    workflow,
    baton: workflowRuntime.baton,
    stepId: workflowRuntime.baton.cursor,
    step: workflowRuntime.cursorStep,
    workerOutput: readResult.workerOutput,
  });
  if (retryResponse) return retryResponse;

  if (isStaticParallelRuntimeStep(workflowRuntime.cursorStep, runtime)) {
    return prepareBranch({ workflow, baton: workflowRuntime.baton, step: workflowRuntime.cursorStep, workerOutput });
  }

  return applyNext({ workflow, baton: workflowRuntime.baton, step: workflowRuntime.cursorStep, workerOutput });
}
