import { Workflow } from '../entities/index.mjs';

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

export function assertRuntimeWorkflowState({ workflow, baton }) {
  return new Workflow(workflow).assertRuntimeState(baton);
}

export function inspectWorkflow({ workflow, baton }) {
  const workflowEntity = new Workflow(workflow);
  const prepared = workflowEntity.preparedParallelStep(baton);
  return responseForPreparedStep(workflowEntity, prepared.baton, prepared.step, { parallelTargets: prepared.parallelTargets });
}

export function renderInterpreterResponse({ workflow, baton, response, renderSteps, includeDiagnostics = false }) {
  new Workflow(workflow).assertRuntimeState(response.baton ?? baton);
  return {
    ...response,
    steps: requireRenderer(renderSteps)({ response, includeDiagnostics }),
  };
}

export function renderWorkflow({ workflow, baton, renderSteps, includeDiagnostics = false }) {
  const response = inspectWorkflow({ workflow, baton });
  return renderInterpreterResponse({ workflow, baton, response, renderSteps, includeDiagnostics });
}
