import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../../../entities/Workflow/transitions.mjs';
import { loadWorkflowAndBaton } from '../guards/workflow.mjs';
import { applyNextTransition } from '../transition/next.mjs';
import { prepareParallelBranch } from '../parallel/render.mjs';
import { applyParallelOutputs } from '../parallel/apply.mjs';
import { hasAppliedOutputForStep } from './response.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from './worker-output.mjs';

function readCandidateOutput({ outputPath, step, outputValue, readJson, readText }) {
  if (outputValue !== undefined) return outputValue;
  if (!step.output?.schema) return readJson(outputPath, 'worker output');
  try {
    return JSON.parse(readText(outputPath, 'worker output'));
  } catch {
    return undefined;
  }
}

export function applyWorkflowOutput(workflowPath, batonPath, outputPath, outputValue, options = {}) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath, { readJson: options.resourceAdapters?.readJson });
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
  const readJson = options.resourceAdapters?.readJson;
  const readText = options.resourceAdapters?.readText;
  if (typeof readJson !== 'function' || typeof readText !== 'function') throw new Error('workflow runtime missing output readers');
  const candidateOutput = canApplyPreparedParallelOutput ? readCandidateOutput({ outputPath, step: cursorStep, outputValue, readJson, readText }) : undefined;
  if (canApplyPreparedParallelOutput && !isParallelOutputEnvelope(candidateOutput)) {
    throw new Error('parallel output must include object steps');
  }

  if (canApplyPreparedParallelOutput) {
    return applyParallelOutputs({
      workflowPath,
      workflow,
      baton,
      cursorStep,
      outputPath,
      allOutput: candidateOutput,
      targets: dynamicNext ? preparedParallelTargets : undefined,
      repositoryRoot: options.repositoryRoot,
      readJson,
      loadOutputSchema: options.resourceAdapters?.loadOutputSchema,
    });
  }

  const readResult = readWorkerOutputForStep({ outputPath, baton, stepId: baton.cursor, step: cursorStep, allOutput: outputValue ?? candidateOutput, readJson, readText });
  if (readResult.retryResponse) return readResult.retryResponse;
  const { workerOutput, retryResponse } = assertOutputSchemaIfDeclared({
    workflowPath,
    workflow,
    baton,
    stepId: baton.cursor,
    step: cursorStep,
    workerOutput: readResult.workerOutput,
    repositoryRoot: options.repositoryRoot,
    loadOutputSchema: options.resourceAdapters?.loadOutputSchema,
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
