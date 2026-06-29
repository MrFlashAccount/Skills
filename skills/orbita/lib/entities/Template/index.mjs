/**
 * Template entity owns prompt rendering and expression compilation mechanics.
 * It renders already-built projection DTOs; file/resource loading stays outside the entity.
 */
import { parsePathExpression } from '../../runtime/expression.mjs';
import {
  renderApprovalInstructionProjection,
  renderApprovalStepProjection,
  renderWorkerInstructionProjection,
  renderWorkflowStepProjection,
} from './compiler/index.mjs';

const TEMPLATE_RENDERERS = Object.freeze({
  approval: renderApprovalStepProjection,
  approvalInstruction: renderApprovalInstructionProjection,
  worker: renderWorkflowStepProjection,
  workerInstruction: renderWorkerInstructionProjection,
});

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

  render(projectionOrContext = this.data, kindOrOptions = {}, maybeOptions = {}) {
    if (typeof this.data.content === 'string' && typeof kindOrOptions !== 'string') {
      return { prompt: this.data.content.replace(/\$\{\{\s*userPrompt\s*\}\}/g, projectionOrContext.userPrompt ?? '') };
    }

    const kind = typeof kindOrOptions === 'string' ? kindOrOptions : (kindOrOptions.kind ?? 'worker');
    const projection = typeof kindOrOptions === 'string' ? projectionOrContext : this.data;
    const options = typeof kindOrOptions === 'string' ? maybeOptions : kindOrOptions;
    const renderer = TEMPLATE_RENDERERS[kind];
    if (!renderer) throw new Error(`unknown template render kind: ${kind}`);
    return renderer(projection, options);
  }
}
