/** Boundary DTO for persisted runtime baton state. */
import { assertPlainObject, assertString, cloneFrozen } from './_dto-utils.mjs';

export class BatonDTO {
  constructor(data) {
    const baton = assertPlainObject(data, 'BatonDTO');
    assertString(baton.cursor, 'BatonDTO.cursor');
    assertString(baton.status, 'BatonDTO.status');
    assertPlainObject(baton.state, 'BatonDTO.state');
    this.data = cloneFrozen(baton);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
