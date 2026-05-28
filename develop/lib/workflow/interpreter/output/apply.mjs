import { readJson } from '../../json-io.mjs';
import { loadWorkflowAndBaton } from '../guards/workflow.mjs';
import { applyNextTransition } from '../transition/next.mjs';
import { prepareParallelBranch } from '../parallel/render.mjs';
import { applyParallelOutputs } from '../parallel/apply.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from './worker-output.mjs';

export function applyWorkflowOutput(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  if (Array.isArray(cursorStep.next)) {
    const candidateOutput = readJson(outputPath, 'worker output');
    if (isParallelOutputEnvelope(candidateOutput)) {
      return applyParallelOutputs({ workflowPath, workflow, baton, cursorStep, outputPath, allOutput: candidateOutput });
    }
  }

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

  return applyNextTransition({ workflow, baton, cursorStep, workerOutput });
}
