import { WorkflowInterpreterError } from './errors.mjs';

export const RESERVED_BATON_STATE_STEP_IDS = new Set(['artifacts', 'results', 'outputs', 'attempts']);

export function assertNoReservedWorkflowStepIds(workflow, { prefix = '' } = {}) {
  for (const stepId of Object.keys(workflow?.steps ?? {})) {
    if (RESERVED_BATON_STATE_STEP_IDS.has(stepId)) {
      throw new WorkflowInterpreterError(`${prefix}workflow step id '${stepId}' is reserved for baton state bookkeeping`);
    }
  }
}
