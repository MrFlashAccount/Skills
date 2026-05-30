import { readFileSync } from 'node:fs';
import { readJson } from '../../json-io.mjs';
import { isDynamicTransitionNext, isStaticParallelNext, resolveTransition } from '../../transitions.mjs';
import { loadWorkflowAndBaton } from '../guards/workflow.mjs';
import { applyNextTransition } from '../transition/next.mjs';
import { prepareParallelBranch } from '../parallel/render.mjs';
import { applyParallelOutputs } from '../parallel/apply.mjs';
import { hasAppliedOutputForStep } from './response.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from './worker-output.mjs';

function readCandidateOutput({ outputPath, step }) {
  if (!step.output?.schema) return readJson(outputPath, 'worker output');
  try {
    return JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch {
    return undefined;
  }
}

export function applyWorkflowOutput(workflowPath, batonPath, outputPath) {
  const { workflow, baton, cursorStep } = loadWorkflowAndBaton(workflowPath, batonPath);
  const staticParallelNext = isStaticParallelNext(cursorStep.next);
  const dynamicNext = isDynamicTransitionNext(cursorStep.next);
  const canApplyPreparedParallelOutput = hasAppliedOutputForStep(baton, baton.cursor) && (staticParallelNext || dynamicNext);
  const candidateOutput = canApplyPreparedParallelOutput ? readCandidateOutput({ outputPath, step: cursorStep }) : undefined;
  if (staticParallelNext && isParallelOutputEnvelope(candidateOutput)) {
    return applyParallelOutputs({ workflowPath, workflow, baton, cursorStep, outputPath, allOutput: candidateOutput });
  }

  if (dynamicNext && isParallelOutputEnvelope(candidateOutput)) {
    const priorOutput = baton.state?.[baton.cursor];
    const resolved = resolveTransition({ workflow, baton, stepId: baton.cursor, step: cursorStep, output: priorOutput });
    if (resolved.targetStepIds) {
      return applyParallelOutputs({
        workflowPath,
        workflow,
        baton,
        cursorStep,
        outputPath,
        allOutput: candidateOutput,
        targets: resolved.targetStepIds,
      });
    }
  }

  const readResult = readWorkerOutputForStep({ outputPath, baton, stepId: baton.cursor, step: cursorStep, allOutput: candidateOutput });
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
