import { batonSchema } from '../entities/Baton/schema/baton-schema.mjs';

const WORKFLOW_SEMANTIC_EXTERNAL_SCHEMAS = Object.freeze([batonSchema]);

export function workflowSemanticValidationOptions({
  resources,
  outputSchemas = resources?.outputSchemas,
  allowedRoles = resources?.allowedRoles,
  externalSchemas = [],
  ...options
} = {}) {
  return {
    ...options,
    outputSchemas,
    allowedRoles,
    externalSchemas: [...WORKFLOW_SEMANTIC_EXTERNAL_SCHEMAS, ...externalSchemas],
  };
}

export { WORKFLOW_SEMANTIC_EXTERNAL_SCHEMAS };
