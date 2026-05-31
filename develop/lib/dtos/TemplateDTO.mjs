/**
 * @typedef {object} TemplateDTOData
 * @property {string} [ref] Template reference selected by caller/persistence.
 * @property {string} [content] Inline template content.
 * @property {string} [workflowPath] Workflow path used for relative template resolution.
 */
import { cloneFrozen } from './_dto-utils.mjs';

/** Boundary DTO for template render inputs loaded by persistence. */
export class TemplateDTO {
  /** @param {TemplateDTOData} data */
  constructor(data) {
    /** @type {Readonly<TemplateDTOData>} */
    this.data = cloneFrozen(data);
  }

  /** @returns {TemplateDTOData} */
  toJSON() {
    return structuredClone(this.data);
  }
}
