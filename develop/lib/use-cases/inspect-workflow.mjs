import { Workflow } from '../entities/index.mjs';
import { assertRuntimeWorkflowState, prepareWorkflowRuntimeStep } from './workflow-runtime-state.mjs';

function buildStepEntry(workflowEntity, stepId, step) {
  return {
    id: stepId,
    action: workflowEntity.actionFor(stepId),
    step: structuredClone(step),
  };
}

function responseForPreparedStep(workflowEntity, baton, step, { parallelTargets = false } = {}) {
  const steps = parallelTargets
    ? step.next.map((targetStepId) => buildStepEntry(workflowEntity, targetStepId, workflowEntity.steps[targetStepId]))
    : [buildStepEntry(workflowEntity, baton.cursor, step)];
  return { baton, steps };
}

function requireRenderer(renderSteps) {
  if (typeof renderSteps !== 'function') throw new Error('renderSteps dependency is required');
  return renderSteps;
}

export { assertRuntimeWorkflowState } from './workflow-runtime-state.mjs';

export function inspectWorkflow({ workflow, baton, runtime }) {
  const workflowEntity = new Workflow(workflow);
  const prepared = prepareWorkflowRuntimeStep({ workflow, baton, runtime });
  return responseForPreparedStep(workflowEntity, prepared.baton, prepared.step, { parallelTargets: prepared.parallelTargets });
}

export function renderInterpreterResponse({ workflow, baton, response, renderSteps, runtime, includeDiagnostics = false }) {
  assertRuntimeWorkflowState({ workflow, baton: response.baton ?? baton, runtime });
  return {
    ...response,
    steps: requireRenderer(renderSteps)({ response, includeDiagnostics }),
  };
}

export function renderWorkflow({ workflow, baton, renderSteps, runtime, includeDiagnostics = false }) {
  const response = inspectWorkflow({ workflow, baton, runtime });
  return renderInterpreterResponse({ workflow, baton, response, renderSteps, runtime, includeDiagnostics });
}
