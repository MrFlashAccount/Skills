/** Boundary DTO for host/worker output crossing into runtime use-cases. */
import { assertPlainObject, cloneFrozen } from './_dto-utils.mjs';

export class OutputDTO {
  constructor(data) {
    const output = assertPlainObject(data, 'OutputDTO');
    this.data = cloneFrozen(output);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
