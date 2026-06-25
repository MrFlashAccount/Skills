export class WorkflowRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkflowRuntimeError';
  }
}

export function invariant(condition, message) {
  if (!condition) throw new WorkflowRuntimeError(message);
}

export const assertRuntime = invariant;
