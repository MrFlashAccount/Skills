/**
 * @typedef {object} StepDTOData
 * @property {string} [id] Workflow step id when carrying a wrapped workflow step.
 * @property {Record<string, unknown>} [step] Wrapped workflow step document.
 * @property {string} [kind] Step kind when carrying an already materialized step document.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for a workflow step crossing into Step entity ownership. */
export class StepDTO {
  /** @param {StepDTOData} data */
  constructor(data) {
    /** @type {Readonly<StepDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {StepDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
