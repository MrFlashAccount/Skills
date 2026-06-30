import { WorkflowRuntimeError } from '../errors.mjs';

export function normalizeCursor(cursor) {
  const values = Array.isArray(cursor) ? cursor : [cursor];
  const stepIds = [];
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new WorkflowRuntimeError('baton cursor must be a non-empty step id or array of step ids');
    }
    if (!stepIds.includes(value)) stepIds.push(value);
  }
  if (stepIds.length === 0) throw new WorkflowRuntimeError('baton cursor must include at least one step id');
  return stepIds;
}

export function cursorForStepIds(stepIds) {
  const normalized = normalizeCursor(stepIds);
  return normalized.length === 1 ? normalized[0] : normalized;
}
