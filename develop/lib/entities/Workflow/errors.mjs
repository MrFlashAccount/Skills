export class WorkflowInterpreterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorkflowInterpreterError';
  }
}

export function invariant(condition, message) {
  if (!condition) throw new WorkflowInterpreterError(message);
}
