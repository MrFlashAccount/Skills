function titleForStep(step) {
  const title = step?.approvalPrompt?.title;
  return typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : step?.id ?? 'Approval request';
}

function inputPromptForStep(step) {
  const prompt = step?.approvalPrompt?.inputPrompt;
  return typeof prompt === 'string' && prompt.trim().length > 0
    ? prompt.trim()
    : 'Ask the user for this workflow approval decision.';
}

function projectedArtifactsForStep(step) {
  const artifacts = step?.approvalPrompt?.artifacts;
  return Array.isArray(artifacts) ? artifacts : [];
}

function projectedSummariesForStep(step) {
  const summaries = step?.approvalPrompt?.summaries;
  return Array.isArray(summaries) ? summaries : [];
}

function promptLayerForStep(step) {
  const promptLayer = step?.approvalPrompt?.promptLayer;
  return typeof promptLayer === 'string' && promptLayer.trim().length > 0
    ? promptLayer.trim()
    : '';
}

function workflowInstructionForStep(step) {
  const instruction = step?.approvalPrompt?.workflowInstruction;
  return typeof instruction === 'string' && instruction.trim().length > 0
    ? instruction.trim()
    : '';
}

export function outputSchemaForRequest(request) {
  const schema = request?.resolvedOutputSchema?.schema;
  return schema && typeof schema === 'object' && !Array.isArray(schema)
    ? schema
    : undefined;
}

function approvalChoicesForStep(step) {
  const choices = step?.approvalPrompt?.choices;
  if (!choices || typeof choices !== 'object' || Array.isArray(choices)) return undefined;
  const path = Array.isArray(choices.path) ? choices.path : undefined;
  const values = Array.isArray(choices.values) ? choices.values : undefined;
  if (!path || !values) return undefined;
  if (!path.every((value) => typeof value === 'string' && value.length > 0)) return undefined;
  if (!values.every((value) => typeof value === 'string')) return undefined;
  return { path, values };
}

export function buildApprovalInstructionProjection({ step, request, commands = {} } = {}) {
  return {
    stepId: step.id,
    title: titleForStep(step),
    inputPrompt: inputPromptForStep(step),
    promptLayer: promptLayerForStep(step),
    workflowInstruction: workflowInstructionForStep(step),
    artifacts: projectedArtifactsForStep(step),
    summaries: projectedSummariesForStep(step),
    outputSchema: outputSchemaForRequest(request),
    choices: approvalChoicesForStep(step),
    writeOutputCommand: commands.writeOutputCommand ?? '',
  };
}
