/** ApplyWorkflowOutput use-case applies host/worker output through Step/Baton-owned runtime behavior. */
import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../entities/Step.mjs';
import { assertLoadedWorkflowAndBaton } from './runtime/guards/workflow.mjs';
import { applyNextTransition } from './runtime/transition/next.mjs';
import { prepareParallelBranch } from './runtime/parallel/render.mjs';
import { applyParallelOutputs } from './runtime/parallel/apply.mjs';
import { hasAppliedOutputForStep } from './runtime/output/response.mjs';
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
  const staticParallelNext = isStaticParallelNext(cursorStep.next);
  const dynamicNext = isDynamicTransitionNext(cursorStep.next);
  const hasAppliedCursorOutput = hasAppliedOutputForStep(baton, baton.cursor);
  let preparedParallelTargets;
  if (hasAppliedCursorOutput && staticParallelNext) preparedParallelTargets = cursorStep.next;
  if (hasAppliedCursorOutput && dynamicNext) {
    const priorOutput = baton.state?.[baton.cursor];
    const resolved = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: priorOutput });
    preparedParallelTargets = resolved.targetStepIds;
  }
  const canApplyPreparedParallelOutput = Boolean(preparedParallelTargets);
  const parsed = parseCandidateOutput({ outputContent, outputValue });
  const candidateOutput = parsed.value;
  if (canApplyPreparedParallelOutput && !isParallelOutputEnvelope(candidateOutput)) {
    throw new Error('parallel output must include object steps');
  }

  if (canApplyPreparedParallelOutput) {
    return applyParallelOutputs({
      workflow,
      baton,
      cursorStep,
      allOutput: candidateOutput,
      targets: dynamicNext ? preparedParallelTargets : undefined,
      resources,
    });
  }

  const readResult = readWorkerOutputForStep({ baton, stepId: baton.cursor, step: cursorStep, allOutput: candidateOutput, outputParseError: parsed.error });
  if (readResult.retryResponse) return readResult.retryResponse;
  const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
    baton,
    stepId: baton.cursor,
    step: cursorStep,
    workerOutput: readResult.workerOutput,
    resources,
  });
  if (retryResponse) return retryResponse;

  if (staticParallelNext) {
    return prepareParallelBranch({
      workflow,
      baton,
      stepId: baton.cursor,
      step: cursorStep,
      output: workerOutput,
      attempts: undefined,
      storeStepOutput: cursorStep.kind === 'approval',
    });
  }

  return applyNextTransition({ workflow, baton, cursorStep, workerOutput });
}

export const ApplyWorkflowOutput = { execute: applyWorkflowOutput };
