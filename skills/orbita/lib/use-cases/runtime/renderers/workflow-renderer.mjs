import { prepareWorkflowPromptContext } from '../../../runtime/prompt-render-context.mjs';
import { finalOutputReminder, outputContractSection, readOutputSchema, readOutputTemplate } from '../../../entities/Template/compiler/sections/output-contract.mjs';
import { projectedStateBlock } from '../../../entities/Template/compiler/sections/projected-state.mjs';
import { defaultPrompt, readInputTemplate } from '../../../entities/Template/compiler/sections/template.mjs';
import { renderWorkflowStepProjection } from '../../../entities/Template/compiler/workflow-renderer.mjs';

function firstNonEmptyString(candidates) {
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value?.trim() ?? '';
}

function workflowInstruction({ workflow }) {
  return firstNonEmptyString([workflow?.instruction, workflow?.instructions]);
}

export function buildWorkflowStepProjection({
  workflow,
  baton,
  entry,
  resources,
  projection,
  requiredReads,
  projectedArtifacts,
  projectedSummaries,
  roleMetadataPaths,
  userPrompt,
  userPromptInjected,
} = {}) {
  const step = entry.step;
  const input = step.input ?? {};
  const preparedContext = prepareWorkflowPromptContext({
    baton,
    stepId: entry.id,
    step,
    resources,
  });
  const context = {
    ...preparedContext,
    projection: projection ?? preparedContext.projection,
    requiredReads: requiredReads ?? preparedContext.requiredReads,
    projectedArtifacts: projectedArtifacts ?? preparedContext.projectedArtifacts,
    projectedSummaries: projectedSummaries ?? preparedContext.projectedSummaries,
    roleMetadataPaths: roleMetadataPaths ?? preparedContext.roleMetadataPaths,
  };
  const stateBlock = projectedStateBlock({ workflow, projection: context.projection, resources, readOutputSchema });
  const inputTemplate = readInputTemplate({ input, resources });
  const outputTemplate = readOutputTemplate({ step, resources });
  const outputSchema = readOutputSchema({ workflow, step, resources });
  const outputContract = outputContractSection(outputTemplate.content, outputTemplate.metadataPath, outputSchema.content, outputSchema.metadataPath, outputSchema.schema, {
    schemaDefinitions: resources?.schemaDefinitions,
    validatingWriterCommand: resources?.validatingWriterCommand,
    artifactOutputDir: resources?.artifactOutputDir,
  });
  const usesDefaultPrompt = inputTemplate.content === undefined;

  return {
    stepId: entry.id,
    step,
    input,
    promptLayer: usesDefaultPrompt ? defaultPrompt({ step, input }) : inputTemplate.content,
    templatePath: inputTemplate.metadataPath,
    workflowInstruction: workflowInstruction({ workflow }),
    requiredReads: context.requiredReads,
    inlinePrompt: input.prompt ?? '',
    stateBlock,
    outputContract,
    userPrompt: step.kind === 'worker' && (userPromptInjected ?? baton?.user_prompt_injected) !== true ? userPrompt : undefined,
    finalReminder: finalOutputReminder(outputContract),
    usesDefaultPrompt,
    metadata: {
      inputTemplate: input.template,
      outputTemplate: step.output?.template,
      outputSchema: step.output?.schema,
      roleMaterial: context.roleMetadataPaths,
      projectedStateKeys: context.projection.projectedKeys,
      projectedArtifacts: context.projectedArtifacts,
      projectedSummaries: context.projectedSummaries,
    },
  };
}

export function renderWorkflowStep(context = {}) {
  return renderWorkflowStepProjection(
    buildWorkflowStepProjection(context),
    { includeDiagnostics: context.includeDiagnostics },
  );
}

export const workflowStepRenderer = Object.freeze({
  kind: 'worker',
  project: buildWorkflowStepProjection,
  render: renderWorkflowStepProjection,
});
