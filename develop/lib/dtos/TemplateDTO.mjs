/** Boundary DTO for template render inputs loaded by persistence. */
import { assertOptionalString, assertPlainObject, cloneFrozen } from './_dto-utils.mjs';

export class TemplateDTO {
  constructor(data) {
    const template = assertPlainObject(data, 'TemplateDTO');
    assertOptionalString(template.ref, 'TemplateDTO.ref');
    assertOptionalString(template.content, 'TemplateDTO.content');
    assertOptionalString(template.workflowPath, 'TemplateDTO.workflowPath');
    if (template.ref === undefined && template.content === undefined && template.workflowPath === undefined) {
      throw new TypeError('TemplateDTO requires at least one boundary field: ref, content, or workflowPath');
    }
    this.data = cloneFrozen(template);
  }

  toJSON() {
    return structuredClone(this.data);
  }
}
