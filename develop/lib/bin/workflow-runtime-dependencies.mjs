import { applyNextTransition as applyNextWorkflowTransition } from '../workflow/interpreter/transition/next.mjs';
import { prepareParallelBranch as prepareWorkflowParallelBranch, renderStepPrompts } from '../workflow/interpreter/parallel/render.mjs';
import { applyParallelOutputs } from '../workflow/interpreter/parallel/apply.mjs';
import { assertOutputSchemaIfDeclared, isParallelOutputEnvelope, readWorkerOutputForStep } from '../workflow/interpreter/output/worker-output.mjs';
import { hasAppliedOutputForStep } from '../workflow/interpreter/output/response.mjs';
import { assertNoReservedWorkflowStepIds } from '../workflow/reserved-state.mjs';
import { assertBatonSchema, assertResponseSchema, assertWorkflowSchema } from '../workflow/schema-validation.mjs';
import { assertProjectableStateSelector, isReservedStateKey, RESERVED_STEP_IDS } from '../workflow/state-keys.mjs';
import { assertTransitionDescriptorTargets, isDynamicTransitionNext, isStaticParallelNext, normalizeTransitionNext, resolveTransition } from '../workflow/transitions.mjs';

export const runtime = {
  assertWorkflowSchema,
  assertBatonSchema,
  assertNoReservedWorkflowStepIds,
  assertProjectableStateSelector,
  isReservedStateKey,
  RESERVED_STEP_IDS,
  assertTransitionDescriptorTargets,
  normalizeTransitionNext,
  hasAppliedOutputForStep,
  isStaticParallelNext,
  isDynamicTransitionNext,
  resolveTransition,
};

/** CLI composition for legacy prompt rendering helpers that still need filesystem context. */
export function createRuntimeRenderSteps({ workflowPath, workflow, response, repositoryRoot, templateBaseDir }) {
  return ({ includeDiagnostics = false } = {}) => {
    const rendered = renderStepPrompts({
      workflowPath,
      workflow,
      baton: response.baton,
      steps: response.steps,
      repositoryRoot,
      templateBaseDir,
      includeDiagnostics,
    });
    assertResponseSchema({ ...response, steps: rendered });
    return rendered;
  };
}

/** CLI composition for applying host/worker output through the layered use case. */
export function createRuntimeApplyDependencies({ workflowPath, repositoryRoot }) {
  return {
    isParallelOutputEnvelope,
    readStepOutput: ({ sourceLabel, baton, stepId, step, outputValue, outputParseError }) => readWorkerOutputForStep({
      outputPath: sourceLabel,
      baton,
      stepId,
      step,
      allOutput: outputValue,
      outputParseError,
    }),
    validateStepOutput: ({ workflow, baton, stepId, step, workerOutput }) => assertOutputSchemaIfDeclared({
      workflowPath,
      workflow,
      baton,
      stepId,
      step,
      workerOutput,
      repositoryRoot,
    }),
    applyParallelBranchOutput: ({ workflow, baton, step, outputPath, outputValue, targets }) => applyParallelOutputs({
      workflowPath,
      workflow,
      baton,
      cursorStep: step,
      outputPath,
      allOutput: outputValue,
      targets,
      repositoryRoot,
    }),
    prepareParallelBranch: ({ workflow, baton, step, workerOutput }) => prepareWorkflowParallelBranch({
      workflow,
      baton,
      stepId: baton.cursor,
      step,
      output: workerOutput,
      attempts: undefined,
      storeStepOutput: step.kind === 'approval',
    }),
    applyNextTransition: ({ workflow, baton, step, workerOutput }) => applyNextWorkflowTransition({ workflow, baton, cursorStep: step, workerOutput }),
  };
}

export const workflowRuntimeDependencies = {
  runtime,
  createRuntimeRenderSteps,
  createRuntimeApplyDependencies,
};
