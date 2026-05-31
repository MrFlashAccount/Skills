import { Workflow } from '../entities/index.mjs';

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
  workflowPath,
  repositoryRoot,
  readStepOutput,
  validateStepOutput,
  isParallelOutputEnvelope,
  applyParallelBranchOutput,
  prepareParallelBranch,
  applyNextTransition,
}) {
  const model = new Workflow(workflow);
  const runtime = model.assertRuntimeState(baton);
  const readOutput = requireDependency({ readStepOutput }, 'readStepOutput');
  const validateOutput = requireDependency({ validateStepOutput }, 'validateStepOutput');
  const isParallelEnvelope = requireDependency({ isParallelOutputEnvelope }, 'isParallelOutputEnvelope');
  const applyParallelOutput = requireDependency({ applyParallelBranchOutput }, 'applyParallelBranchOutput');
  const prepareBranch = requireDependency({ prepareParallelBranch }, 'prepareParallelBranch');
  const applyNext = requireDependency({ applyNextTransition }, 'applyNextTransition');
  const sourceLabel = outputPathLabel(outputPath);

  const prepared = model.preparedParallelStep(runtime.baton);
  if (prepared.parallelTargets) {
    if (!isParallelEnvelope(outputValue)) throw new Error('parallel output must include object steps');
    return applyParallelOutput({
      workflowPath,
      workflow,
      baton: runtime.baton,
      step: prepared.step,
      outputPath: sourceLabel,
      outputValue,
      targets: Array.isArray(prepared.step.next) ? undefined : prepared.step.next,
      repositoryRoot,
    });
  }

  const readResult = readOutput({
    sourceLabel,
    baton: runtime.baton,
    stepId: runtime.baton.cursor,
    step: runtime.cursorStep,
    outputValue,
    outputParseError,
  });
  if (readResult.retryResponse) return readResult.retryResponse;

  const { workerOutput, retryResponse } = validateOutput({
    workflowPath,
    workflow,
    baton: runtime.baton,
    stepId: runtime.baton.cursor,
    step: runtime.cursorStep,
    workerOutput: readResult.workerOutput,
    repositoryRoot,
  });
  if (retryResponse) return retryResponse;

  if (model.isStaticParallelStep(runtime.cursorStep)) {
    return prepareBranch({ workflow, baton: runtime.baton, step: runtime.cursorStep, workerOutput });
  }

  return applyNext({ workflow, baton: runtime.baton, step: runtime.cursorStep, workerOutput });
}
