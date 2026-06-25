/**
 * @typedef {object} InstructionDTOData
 * @property {string} path Source path for the loaded instruction content.
 * @property {string} content Loaded instruction content.
 * @property {string} [stepId] Optional requested workflow step id.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for instruction file content. */
export class InstructionDTO {
  /** @param {InstructionDTOData} data */
  constructor(data) {
    /** @type {Readonly<InstructionDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {InstructionDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
