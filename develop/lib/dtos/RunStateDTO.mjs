/**
 * @typedef {object} RunStateDTOData
 * @property {Record<string, unknown>} baton Runtime baton projection from validated persistence.
 * @property {Array<Record<string, unknown>>} [requests] Pending instruction/request projection records.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/**
 * Boundary DTO for runtime run-state projection only.
 *
 * This is not a durable storage schema; persisted aggregate validation is owned by
 * `persistence/run-state/persisted-state-schema.mjs`.
 */
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
