/**
 * @typedef {object} BatonDTOData
 * @property {string} cursor Current workflow step id.
 * @property {string} status Runtime status derived from the cursor step.
 * @property {Record<string, unknown>} state Persisted workflow state.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for persisted runtime baton state. */
export class BatonDTO {
  /** @param {BatonDTOData} data */
  constructor(data) {
    /** @type {Readonly<BatonDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {BatonDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
