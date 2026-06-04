/** Canonical seam for workflow semantic-validation context normalization and shared external schema registry. */
import { batonSchema } from './Baton/schema/baton-schema.mjs';

const WORKFLOW_SEMANTIC_EXTERNAL_SCHEMAS = Object.freeze([batonSchema]);

function materialize(value) {
  return typeof value?.toJSON === 'function' ? value.toJSON() : value;
}

function loadedOutputSchema(outputSchemas, stepId, schemaRef) {
  if (outputSchemas instanceof Map) return outputSchemas.get(stepId) ?? outputSchemas.get(schemaRef);
  return outputSchemas?.[stepId] ?? outputSchemas?.[schemaRef];
}

function normalizeWorkflowOutputSchemas(workflowDoc, outputSchemas = new Map()) {
  const schemasByStep = new Map();
  for (const [stepId, step] of Object.entries(workflowDoc?.steps ?? {})) {
    const schemaRef = step.output?.schema;
    if (!schemaRef) continue;
    const loaded = loadedOutputSchema(outputSchemas, stepId, schemaRef);
    if (!loaded) continue;
    schemasByStep.set(stepId, loaded?.schema ?? loaded);
  }
  return schemasByStep;
}

export function normalizeWorkflowSemanticValidationContext({
  workflow,
  resources,
  outputSchemas = resources?.outputSchemas,
  allowedRoles = resources?.allowedRoles,
  externalSchemas = [],
  ...options
} = {}) {
  const workflowDoc = materialize(workflow);
  return {
    ...options,
    allowedRoles,
    outputSchemas: normalizeWorkflowOutputSchemas(workflowDoc, outputSchemas),
    externalSchemas: [...WORKFLOW_SEMANTIC_EXTERNAL_SCHEMAS, ...externalSchemas],
  };
}

export { WORKFLOW_SEMANTIC_EXTERNAL_SCHEMAS };
