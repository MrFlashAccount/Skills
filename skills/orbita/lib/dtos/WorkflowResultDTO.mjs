/**
 * @typedef {object} WorkflowResultDTOData
 * @property {boolean} [ok] Success marker returned by use-cases.
 * @property {string} [status] Runtime status returned by use-cases.
 * @property {number|Array<unknown>|Record<string, unknown>} [steps] Step count or step projection returned by use-cases.
 * @property {Record<string, unknown>} [baton] Baton projection returned by use-cases.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for use-case result returned to entrypoints/API callers. */
export class WorkflowResultDTO {
  /** @param {WorkflowResultDTOData} data */
  constructor(data) {
    /** @type {Readonly<WorkflowResultDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {WorkflowResultDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
