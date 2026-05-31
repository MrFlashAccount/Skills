import { WorkflowRuntimeError } from './errors.mjs';

export const RESERVED_BATON_STATE_STEP_IDS = new Set(['artifacts', 'results', 'outputs', 'attempts']);
export const DANGEROUS_OBJECT_STEP_IDS = new Set(['__proto__', 'prototype', 'constructor']);

export function assertNoReservedWorkflowStepIds(workflow, { prefix = '' } = {}) {
  for (const stepId of Object.keys(workflow?.steps ?? {})) {
    if (RESERVED_BATON_STATE_STEP_IDS.has(stepId)) {
      throw new WorkflowRuntimeError(`${prefix}workflow step id '${stepId}' is reserved for runtime aggregate state`);
    }
    if (DANGEROUS_OBJECT_STEP_IDS.has(stepId)) {
      throw new WorkflowRuntimeError(`${prefix}workflow step id '${stepId}' is reserved because it is unsafe as a JavaScript object key`);
    }
  }
}
