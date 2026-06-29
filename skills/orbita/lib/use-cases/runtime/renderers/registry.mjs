import { approvalStepRenderer } from './approval-renderer.mjs';
import { workflowStepRenderer } from './workflow-renderer.mjs';
import { Template } from '../../../entities/Template/index.mjs';

export const STEP_RENDERERS = Object.freeze({
  [approvalStepRenderer.kind]: approvalStepRenderer,
  [workflowStepRenderer.kind]: workflowStepRenderer,
});

export function rendererForStepKind(kind) {
  return STEP_RENDERERS[kind];
}

export function renderExecutableStep(context = {}) {
  const renderer = rendererForStepKind(context.entry?.step?.kind);
  if (!renderer) return {};
  const projection = renderer.project(context);
  return new Template().render(projection, renderer.kind, { includeDiagnostics: context.includeDiagnostics });
}
