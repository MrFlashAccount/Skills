/**
 * @typedef {object} RunStateDTOData
 * @property {Record<string, unknown>} baton Persisted baton document.
 * @property {Array<Record<string, unknown>>} [requests] Pending instruction/request records.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for persisted run-state projection. */
export class RunStateDTO {
  /** @param {RunStateDTOData} data */
  constructor(data) {
    /** @type {Readonly<RunStateDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {RunStateDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
