/** ApplyWorkflowOutput use-case applies host/worker output through Step/Baton-owned runtime behavior. */
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';
import { applyNextTransition } from './runtime/transition/next.mjs';
import { applyParallelOutputs } from './runtime/parallel/apply.mjs';
import { normalizeCursor } from '../runtime/cursor.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from './runtime/output/worker-output.mjs';

function parseCandidateOutput({ outputContent, outputValue }) {
  if (outputValue !== undefined) return { value: outputValue, error: undefined };
  try {
    return { value: JSON.parse(outputContent), error: undefined };
  } catch (error) {
    return { value: undefined, error };
  }
}

export function applyWorkflowOutput({ workflowDoc, batonDoc, outputContent, outputValue, resources } = {}) {
  const { workflow, baton, cursorStep } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles, outputSchemas: resources?.outputSchemas });
  const cursorStepIds = normalizeCursor(baton.cursor);
  const hasParallelCursor = cursorStepIds.length > 1;
  const parsed = parseCandidateOutput({ outputContent, outputValue });
  const candidateOutput = parsed.value;
  if (hasParallelCursor && !isParallelOutputEnvelope(candidateOutput)) {
    throw new Error('parallel output must include object steps');
  }

  if (hasParallelCursor) {
    return applyParallelOutputs({
      workflow,
      baton,
      cursorStep: { next: cursorStepIds },
      allOutput: candidateOutput,
      targets: cursorStepIds,
      resources,
    });
  }

  const stepId = cursorStepIds[0];
  const readResult = readWorkerOutputForStep({ baton, stepId, step: cursorStep, allOutput: candidateOutput, outputParseError: parsed.error });
  if (readResult.retryResponse) return readResult.retryResponse;
  const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
    baton,
    stepId,
    step: cursorStep,
    workerOutput: readResult.workerOutput,
    resources,
  });
  if (retryResponse) return retryResponse;

  return applyNextTransition({ workflow, baton, cursorStep, workerOutput, stepId });
}

export const ApplyWorkflowOutput = { execute: applyWorkflowOutput };
