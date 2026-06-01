/**
 * Template entity owns prompt rendering and expression compilation mechanics.
 * It receives render context; file/resource loading stays in persistence/legacy adapters.
 */
import { parsePathExpression } from '../Step/expressions/index.mjs';
import { renderWorkflowPrompt as renderCompiledWorkflowPrompt } from './compiler/index.mjs';

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
    return renderCompiledWorkflowPrompt({ ...this.data, ...context });
  }
}

export function renderWorkflowPrompt(context = {}) {
  return new Template(context.templateData ?? {}).render(context);
}
