/** Boundary DTO for instruction file content. */
import { assertPlainObject, assertString, cloneFrozen } from './_dto-utils.mjs';

export class InstructionDTO {
  constructor(data) {
    const instruction = assertPlainObject(data, 'InstructionDTO');
    assertString(instruction.path, 'InstructionDTO.path');
    assertString(instruction.content, 'InstructionDTO.content', { allowEmpty: true });
    this.data = cloneFrozen(instruction);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
