/** Boundary DTO for persisted run-state projection. */
import { assertPlainObject, cloneFrozen } from './_dto-utils.mjs';

export class RunStateDTO {
  constructor(data) {
    const runState = assertPlainObject(data, 'RunStateDTO');
    assertPlainObject(runState.baton, 'RunStateDTO.baton');
    this.data = cloneFrozen(runState);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
