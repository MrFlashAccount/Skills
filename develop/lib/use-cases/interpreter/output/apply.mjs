import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../../../entities/Step.mjs';
import { assertLoadedWorkflowAndBaton } from '../guards/workflow.mjs';
import { applyNextTransition } from '../transition/next.mjs';
import { prepareParallelBranch } from '../parallel/render.mjs';
import { applyParallelOutputs } from '../parallel/apply.mjs';
import { hasAppliedOutputForStep } from './response.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from './worker-output.mjs';

function parseCandidateOutput({ outputContent, outputValue }) {
  if (outputValue !== undefined) return { value: outputValue, error: undefined };
  try {
    return { value: JSON.parse(outputContent), error: undefined };
  } catch (error) {
    return { value: undefined, error };
  }
}

export function applyWorkflowOutput({ workflowDoc, batonDoc, outputContent, outputValue, resources } = {}) {
  const { workflow, baton, cursorStep } = assertLoadedWorkflowAndBaton(workflowDoc, batonDoc, { allowedRoles: resources?.allowedRoles });
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
