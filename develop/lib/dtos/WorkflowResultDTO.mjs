/** Boundary DTO for use-case result returned to entrypoints/API callers. */
import { assertPlainObject, cloneFrozen } from './_dto-utils.mjs';

export class WorkflowResultDTO {
  constructor(data) {
    const result = assertPlainObject(data, 'WorkflowResultDTO');
    if (!('ok' in result) && !('status' in result) && !('steps' in result) && !('baton' in result)) {
      throw new TypeError('WorkflowResultDTO requires a concrete result field: ok, status, steps, or baton');
    }
    this.data = cloneFrozen(result);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
