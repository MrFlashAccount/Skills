/**
 * @typedef {object} WorkflowDTOData
 * @property {string} name Workflow identifier.
 * @property {string} start Start step id.
 * @property {string} done Done terminal step id.
 * @property {string} blocked Blocked terminal step id.
 * @property {Record<string, Record<string, unknown>>} steps Workflow step map keyed by step id.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for workflow file/API input. */
export class WorkflowDTO {
  /** @param {WorkflowDTOData} data */
  constructor(data) {
    /** @type {Readonly<WorkflowDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {WorkflowDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
