import { prepareWorkflowPromptContext } from '../../../runtime/prompt-render-context.mjs';
import { assertNoUnsupportedPlaceholders, readInputTemplate } from '../../../entities/Template/compiler/sections/template.mjs';
import { trimStable } from '../../../entities/Template/compiler/utils.mjs';
import { renderApprovalStepProjection } from '../../../entities/Template/compiler/approval-renderer.mjs';

function firstNonEmptyString(candidates) {
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value?.trim() ?? '';
}

function workflowInstruction({ workflow }) {
  return firstNonEmptyString([workflow?.instruction, workflow?.instructions]);
}

function explicitPromptLayer({ step, resources }) {
  const input = step?.input ?? {};
  const inputTemplate = readInputTemplate({ input, resources });
  if (inputTemplate.content === undefined) return '';
  assertNoUnsupportedPlaceholders(inputTemplate.content, inputTemplate.metadataPath);
  return trimStable(inputTemplate.content);
}

export function buildApprovalStepProjection({ workflow, baton, entry, resources } = {}) {
  const context = prepareWorkflowPromptContext({
    baton,
    stepId: entry.id,
    step: entry.step,
    resources,
  });

  return {
    promptLayer: explicitPromptLayer({ step: entry.step, resources }),
    workflowInstruction: workflowInstruction({ workflow }),
    state: context.projection.value,
    artifacts: context.projectedArtifacts,
    summaries: context.projectedSummaries,
  };
}

export function renderApprovalStep(context = {}) {
  return renderApprovalStepProjection(buildApprovalStepProjection(context));
}

export const approvalStepRenderer = Object.freeze({
  kind: 'approval',
  project: buildApprovalStepProjection,
  render: renderApprovalStepProjection,
});
