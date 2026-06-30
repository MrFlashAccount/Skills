import { finalOutputReminder, outputContractSection, readOutputSchema, readOutputTemplate } from './sections/output-contract.mjs';
import { interpolatePromptExpressions } from './sections/prompt-interpolation.mjs';
import { normalizePromptText } from '../../../runtime/prompt-text.mjs';
import { section, trimStable } from './utils.mjs';
import { assertNoUnsupportedPlaceholders, defaultPrompt, readInputTemplate } from './sections/template.mjs';

function firstNonEmptyString(candidates) {
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value?.trim() ?? '';
}

function workflowInstruction({ workflow }) {
  return firstNonEmptyString([workflow?.instruction, workflow?.instructions]);
}

function requiredReadsBlock(items = []) {
  if (items.length === 0) return '';
  const lines = [
    'Read these files before acting, in order:',
    '',
  ];
  items.forEach((item, index) => {
    const suffix = item.contentType ? ` (${item.contentType})` : '';
    lines.push(`${index + 1}. ${item.label}${suffix}: \`${item.path}\``);
  });
  lines.push('', 'Do not proceed until all required reads are complete.');
  return lines.join('\n');
}

function requiredReadsForRender(items, { followUp = false } = {}) {
  if (followUp !== true) return items;
  return items.filter((item) => item?.source !== 'role-material');
}

function assembleFixedPrompt({ promptLayer, templatePath, workflowInstructionBlock, requiredReads, inlinePrompt, outputContract, userPrompt, finalReminder }) {
  assertNoUnsupportedPlaceholders(promptLayer, templatePath);
  const parts = [trimStable(promptLayer)];

  if (workflowInstructionBlock) parts.push(section('Workflow instruction', workflowInstructionBlock).trimEnd());
  if (requiredReads) parts.push(section('Required reads', requiredReads).trimEnd());
  if (outputContract) parts.push(outputContract.trimEnd());
  if (inlinePrompt) parts.push(section('Workflow step prompt', inlinePrompt.trim()));
  if (typeof userPrompt === 'string' && userPrompt.trim().length > 0) parts.push(section('User prompt', userPrompt));
  if (finalReminder) parts.push(finalReminder.trimEnd());

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

export function renderWorkflowPrompt({ workflow, stepId, step, resources, promptInput = { value: {}, keys: [] }, requiredReads = [], roleMetadataPaths = [], includeDiagnostics = false, userPrompt, userPromptInjected = false, followUp = false } = {}) {
  const input = step.input ?? {};
  const inputTemplate = readInputTemplate({ input, resources });
  const outputTemplate = readOutputTemplate({ step, resources });
  const outputSchema = readOutputSchema({ workflow, step, resources });
  const outputContract = outputContractSection(outputTemplate.content, outputTemplate.metadataPath, outputSchema.content, outputSchema.metadataPath, outputSchema.schema, {
    schemaDefinitions: resources?.schemaDefinitions,
    validatingWriterCommand: resources?.validatingWriterCommand,
    artifactOutputDir: resources?.artifactOutputDir,
  });
  const workflowInstructionBlock = workflowInstruction({ workflow });
  const finalReminder = finalOutputReminder(outputContract);

  const usesDefaultPrompt = inputTemplate.content === undefined;
  const promptLayer = usesDefaultPrompt ? defaultPrompt({ step, input }) : inputTemplate.content;
  const requiredReadsSection = requiredReadsBlock(requiredReadsForRender(requiredReads, { followUp }));
  const prompt = assembleFixedPrompt({
    promptLayer,
    templatePath: inputTemplate.metadataPath,
    workflowInstructionBlock,
    requiredReads: requiredReadsSection,
    inlinePrompt: interpolatePromptExpressions(normalizePromptText(input.prompt), { input: promptInput.value }),
    outputContract,
    userPrompt: step.kind === 'worker' && userPromptInjected !== true ? userPrompt : undefined,
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
  if (roleMetadataPaths.length > 0) metadata.roleMaterial = roleMetadataPaths;

  const compiledPrompt = { prompt };
  if (Object.keys(metadata).length > 0) compiledPrompt.metadata = metadata;
  if (includeDiagnostics && diagnostics.length > 0) compiledPrompt.diagnostics = diagnostics;
  return compiledPrompt;
}
