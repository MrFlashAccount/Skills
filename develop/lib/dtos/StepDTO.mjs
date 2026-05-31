/** Boundary DTO for a workflow step crossing into Step entity ownership. */
import { assertPlainObject, assertString, cloneFrozen } from './_dto-utils.mjs';

export class StepDTO {
  constructor(data) {
    const input = assertPlainObject(data, 'StepDTO');
    if ('step' in input) {
      assertString(input.id, 'StepDTO.id');
      assertPlainObject(input.step, 'StepDTO.step');
    } else {
      assertString(input.kind, 'StepDTO.kind');
    }
    this.data = cloneFrozen(input);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
