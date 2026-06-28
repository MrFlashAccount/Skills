import { assertNoUnsupportedPlaceholders } from './sections/template.mjs';
import { section, trimStable } from './utils.mjs';

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

function assembleFixedPrompt({ promptLayer, templatePath, workflowInstructionBlock, requiredReads, inlinePrompt, stateBlock, outputContract, userPrompt, finalReminder }) {
  assertNoUnsupportedPlaceholders(promptLayer, templatePath);
  const parts = [trimStable(promptLayer)];

  if (workflowInstructionBlock) parts.push(section('Workflow instruction', workflowInstructionBlock).trimEnd());
  if (requiredReads) parts.push(section('Required reads', requiredReads).trimEnd());
  if (outputContract) parts.push(outputContract.trimEnd());
  if (stateBlock) parts.push(section('Projected baton state', stateBlock).trimEnd());
  if (inlinePrompt) parts.push(section('Workflow step prompt', inlinePrompt.trim()));
  if (typeof userPrompt === 'string' && userPrompt.trim().length > 0) parts.push(section('User prompt', userPrompt));
  if (finalReminder) parts.push(finalReminder.trimEnd());

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

export function renderWorkflowStepProjection(projection, { includeDiagnostics = false } = {}) {
  const prompt = assembleFixedPrompt({
    promptLayer: projection.promptLayer,
    templatePath: projection.templatePath,
    workflowInstructionBlock: projection.workflowInstruction,
    requiredReads: requiredReadsBlock(projection.requiredReads),
    inlinePrompt: projection.inlinePrompt,
    stateBlock: projection.stateBlock,
    outputContract: projection.outputContract,
    userPrompt: projection.userPrompt,
    finalReminder: projection.finalReminder,
  });

  const metadata = {};
  if (projection.metadata.inputTemplate) metadata.inputTemplate = projection.metadata.inputTemplate;
  if (projection.metadata.outputTemplate) metadata.outputTemplate = projection.metadata.outputTemplate;
  if (projection.metadata.outputSchema) metadata.outputSchema = projection.metadata.outputSchema;
  if (projection.metadata.roleMaterial.length > 0) metadata.roleMaterial = projection.metadata.roleMaterial;
  if (projection.metadata.projectedStateKeys.length > 0) metadata.projectedStateKeys = projection.metadata.projectedStateKeys;
  if (projection.metadata.projectedArtifacts.length > 0) metadata.projectedArtifacts = projection.metadata.projectedArtifacts;
  if (projection.metadata.projectedSummaries.length > 0) metadata.projectedSummaries = projection.metadata.projectedSummaries;

  const compiledPrompt = { prompt };
  if (Object.keys(metadata).length > 0) compiledPrompt.metadata = metadata;
  if (includeDiagnostics && projection.usesDefaultPrompt) {
    compiledPrompt.diagnostics = [
      {
        severity: 'info',
        code: 'default_prompt_used',
        message: 'No input.template declared; assembled deterministic default prompt.',
      },
    ];
  }
  return { compiledPrompt };
}
