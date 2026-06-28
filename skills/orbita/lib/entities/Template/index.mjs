/**
 * Template entity owns prompt rendering and expression compilation mechanics.
 * It renders already-built projection DTOs; file/resource loading stays outside the entity.
 */
import { parsePathExpression } from '../../runtime/expression.mjs';
import { renderWorkflowStepProjection } from './compiler/index.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto ?? {});
}

export class Template {
  constructor(templateData = {}) {
    this.data = cloneBoundaryData(templateData);
    Object.freeze(this.data);
  }

  toJSON() {
    return structuredClone(this.data);
  }

  compileExpression(expression) {
    return parsePathExpression(expression);
  }

  render(context = {}) {
    if (typeof this.data.content === 'string') {
      return { prompt: this.data.content.replace(/\$\{\{\s*userPrompt\s*\}\}/g, context.userPrompt ?? '') };
    }
    return renderWorkflowStepProjection(this.data, context).compiledPrompt;
  }
}
