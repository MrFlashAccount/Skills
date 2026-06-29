function titleForStep(step) {
  return step?.step?.name ?? step?.id ?? 'Approval request';
}

function inputPromptForStep(step) {
  const prompt = step?.step?.input?.prompt;
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

function projectedStateForStep(step) {
  const state = step?.approvalPrompt?.state;
  return state && typeof state === 'object' && !Array.isArray(state)
    ? state
    : {};
}

export function outputSchemaForRequest(request) {
  const schema = request?.resolvedOutputSchema?.schema;
  return schema && typeof schema === 'object' && !Array.isArray(schema)
    ? schema
    : undefined;
}

function enumChoicesFromOutputSchema(schema) {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return undefined;
  }
  for (const [name, propertySchema] of Object.entries(properties)) {
    const values = propertySchema?.enum;
    if (Array.isArray(values) && values.every((value) => typeof value === 'string')) {
      return { property: name, values };
    }
  }
  return undefined;
}

function enumChoicesFromTransition(step) {
  const next = step?.step?.next;
  const cases = next?.cases;
  if (!cases || typeof cases !== 'object' || Array.isArray(cases)) return undefined;
  const match = next?.match;
  const matched = typeof match === 'string'
    ? match.match(/^\$\{\{\s*output\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/)
    : null;
  return {
    property: matched?.[1] ?? 'approval',
    values: Object.keys(cases),
  };
}

function fallbackApprovalChoices() {
  return {
    property: 'approval',
    values: ['approved', 'rejected', 'blocked'],
  };
}

function approvalChoices({ step, request }) {
  const schema = outputSchemaForRequest(request);
  return enumChoicesFromTransition(step)
    ?? enumChoicesFromOutputSchema(schema)
    ?? (schema ? undefined : fallbackApprovalChoices());
}

export function buildApprovalInstructionProjection({ step, request, commands = {} } = {}) {
  return {
    stepId: step.id,
    title: titleForStep(step),
    inputPrompt: inputPromptForStep(step),
    promptLayer: promptLayerForStep(step),
    workflowInstruction: workflowInstructionForStep(step),
    state: projectedStateForStep(step),
    artifacts: projectedArtifactsForStep(step),
    summaries: projectedSummariesForStep(step),
    outputSchema: outputSchemaForRequest(request),
    choices: approvalChoices({ step, request }),
    writeOutputCommand: commands.writeOutputCommand ?? '',
  };
}
