import { finalOutputReminder, outputContractSection, readOutputSchema, readOutputTemplate } from './sections/output-contract.mjs';
import { projectedStateBlock } from './sections/projected-state.mjs';
import { projectState } from '../../../runtime/state-projection.mjs';
import { section, trimStable } from './utils.mjs';
import { readInputRole } from './sections/role.mjs';
import { assertNoUnsupportedPlaceholders, defaultPrompt, readInputTemplate } from './sections/template.mjs';

function firstNonEmptyString(candidates) {
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value?.trim() ?? '';
}

function workflowInstruction({ workflow }) {
  return firstNonEmptyString([workflow?.instruction, workflow?.instructions]);
}

function assembleFixedPrompt({ promptLayer, templatePath, workflowInstructionBlock, inlinePrompt, roleBlock, stateBlock, outputContract, userPrompt, finalReminder }) {
  assertNoUnsupportedPlaceholders(promptLayer, templatePath);
  const parts = [trimStable(promptLayer)];

  if (workflowInstructionBlock) parts.push(section('Workflow instruction', workflowInstructionBlock).trimEnd());
  if (roleBlock) parts.push(section('Role material', roleBlock).trimEnd());
  if (outputContract) parts.push(outputContract.trimEnd());
  if (stateBlock) parts.push(section('Projected baton state', stateBlock).trimEnd());
  if (inlinePrompt) parts.push(section('Workflow step prompt', inlinePrompt.trim()));
  if (typeof userPrompt === 'string' && userPrompt.trim().length > 0) parts.push(section('User prompt', userPrompt));
  if (finalReminder) parts.push(finalReminder.trimEnd());

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

export function renderWorkflowPrompt({ workflow, baton, stepId, step, resources, includeDiagnostics = false, userPrompt } = {}) {
  const input = step.input ?? {};
  const selectors = input.state ?? [];
  const projection = projectState({ batonState: baton.state ?? {}, selectors, stepId });
  const stateBlock = projectedStateBlock({ workflow, projection, resources, readOutputSchema });
  const inputTemplate = readInputTemplate({ input, resources });
  const inputRole = readInputRole({ input, resources });
  const outputTemplate = readOutputTemplate({ step, resources });
  const outputSchema = readOutputSchema({ workflow, step, resources });
  const outputContract = outputContractSection(outputTemplate.content, outputTemplate.metadataPath, outputSchema.content, outputSchema.metadataPath, outputSchema.schema);
  const workflowInstructionBlock = workflowInstruction({ workflow });
  const finalReminder = finalOutputReminder(outputContract);

  const usesDefaultPrompt = inputTemplate.content === undefined;
  const promptLayer = usesDefaultPrompt ? defaultPrompt({ step, input }) : inputTemplate.content;
  const prompt = assembleFixedPrompt({
    promptLayer,
    templatePath: inputTemplate.metadataPath,
    workflowInstructionBlock,
    inlinePrompt: input.prompt ?? '',
    roleBlock: inputRole.content,
    stateBlock,
    outputContract,
    userPrompt: step.kind === 'worker' && baton.user_prompt_injected !== true ? userPrompt : undefined,
    finalReminder,
  });
  const diagnostics = usesDefaultPrompt
    ? [
        {
          severity: 'info',
          code: 'default_prompt_used',
          message: 'No input.template declared; assembled deterministic default prompt.',
        },
      ]
    : [];

  const metadata = {};
  if (input.template) metadata.inputTemplate = input.template;
  if (step.output?.template) metadata.outputTemplate = step.output.template;
  if (step.output?.schema) metadata.outputSchema = step.output.schema;
  if (inputRole.metadataPaths.length > 0) metadata.roleMaterial = inputRole.metadataPaths;
  if (projection.projectedKeys.length > 0) metadata.projectedStateKeys = projection.projectedKeys;

  const compiledPrompt = { prompt };
  if (Object.keys(metadata).length > 0) compiledPrompt.metadata = metadata;
  if (includeDiagnostics && diagnostics.length > 0) compiledPrompt.diagnostics = diagnostics;
  return compiledPrompt;
}
