import { applyWorkflowOutput } from './apply-workflow-output.mjs';
import { renderInterpreterResponse } from './inspect-workflow.mjs';

/** Applies host output DTOs and renders the next interpreter response. */
export function continueRun({
  workflow,
  baton,
  outputValue,
  outputParseError,
  outputPath,
  workflowPath,
  repositoryRoot,
  historyOutput,
  renderSteps,
  readStepOutput,
  validateStepOutput,
  isParallelOutputEnvelope,
  applyParallelBranchOutput,
  prepareParallelBranch,
  applyNextTransition,
  includeDiagnostics = false,
}) {
  const applied = applyWorkflowOutput({
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
  });
  const rendered = renderInterpreterResponse({
    workflow,
    baton,
    response: applied,
    renderSteps,
    includeDiagnostics,
  });
  return {
    rendered,
    baton: applied.baton,
    historyOutput,
  };
}
