import { applyWorkflowOutput } from './apply-workflow-output.mjs';
import { renderInterpreterResponse } from './inspect-workflow.mjs';

/** Applies host output DTOs and renders the next interpreter response. */
export function continueRun({
  workflow,
  baton,
  outputValue,
  outputParseError,
  outputPath,
  historyOutput,
  renderSteps,
  readStepOutput,
  validateStepOutput,
  isParallelOutputEnvelope,
  applyParallelBranchOutput,
  prepareParallelBranch,
  applyNextTransition,
  runtime,
  includeDiagnostics = false,
}) {
  const applied = applyWorkflowOutput({
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
  });
  const rendered = renderInterpreterResponse({
    workflow,
    baton,
    response: applied,
    renderSteps,
    runtime,
    includeDiagnostics,
  });
  return {
    rendered,
    baton: applied.baton,
    historyOutput,
  };
}
