import { prepareWorkflowPromptContext } from '../../../runtime/prompt-render-context.mjs';
import { NEXT_KIND, normalizeTransitionNext } from '../../../runtime/transition-next.mjs';
import { assertNoUnsupportedPlaceholders, readInputTemplate } from '../../../entities/Template/compiler/sections/template.mjs';
import { readOutputSchema } from '../../../entities/Template/compiler/sections/output-contract.mjs';
import { trimStable } from '../../../entities/Template/compiler/utils.mjs';
import { Template } from '../../../entities/Template/index.mjs';

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

function titleForStep({ step, stepId }) {
  return firstNonEmptyString([step?.name, stepId, 'Approval request']);
}

function inputPromptForStep(step) {
  return firstNonEmptyString([step?.input?.prompt, 'Ask the user for this workflow approval decision.']);
}

function enumChoicesFromOutputSchema(schema) {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return undefined;
  }
  for (const [name, propertySchema] of Object.entries(properties)) {
    const values = propertySchema?.enum;
    if (Array.isArray(values) && values.every((value) => typeof value === 'string')) {
      return { path: [name], values };
    }
  }
  return undefined;
}

function choicesFromTransitionDescriptor(descriptor) {
  if (descriptor.kind === NEXT_KIND.MATCH_CASES && descriptor.expression.root === 'output') {
    return { path: [...descriptor.expression.path], values: Object.keys(descriptor.cases) };
  }

  if (descriptor.kind !== NEXT_KIND.PARALLEL_ITEMS) return undefined;
  for (const item of descriptor.items) {
    const choices = choicesFromTransitionDescriptor(item);
    if (choices) return choices;
  }
  return undefined;
}

function enumChoicesFromTransition(step) {
  if (step?.next === undefined) return undefined;
  return choicesFromTransitionDescriptor(normalizeTransitionNext(step.next));
}

function fallbackApprovalChoices() {
  return {
    path: ['approval'],
    values: ['approved', 'rejected', 'blocked'],
  };
}

function approvalChoices({ step, outputSchema }) {
  return enumChoicesFromTransition(step)
    ?? enumChoicesFromOutputSchema(outputSchema)
    ?? (outputSchema ? undefined : fallbackApprovalChoices());
}

export function buildApprovalStepProjection({ workflow, baton, entry, resources } = {}) {
  const context = prepareWorkflowPromptContext({
    baton,
    stepId: entry.id,
    step: entry.step,
    resources,
  });
  const outputSchema = readOutputSchema({ step: entry.step, resources }).schema;

  return {
    title: titleForStep({ step: entry.step, stepId: entry.id }),
    inputPrompt: inputPromptForStep(entry.step),
    promptLayer: explicitPromptLayer({ step: entry.step, resources }),
    workflowInstruction: workflowInstruction({ workflow }),
    artifacts: context.projectedArtifacts,
    summaries: context.projectedSummaries,
    choices: approvalChoices({ step: entry.step, outputSchema }),
  };
}

export function renderApprovalStep(context = {}) {
  return new Template().render(buildApprovalStepProjection(context), 'approval');
}

export const approvalStepRenderer = Object.freeze({
  kind: 'approval',
  project: buildApprovalStepProjection,
});
