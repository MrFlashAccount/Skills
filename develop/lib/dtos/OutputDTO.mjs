/**
 * @typedef {Record<string, unknown>} OutputDTOData
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for host/worker output crossing into runtime use-cases. */
export class OutputDTO {
  /** @param {OutputDTOData} data */
  constructor(data) {
    /** @type {Readonly<OutputDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {OutputDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
