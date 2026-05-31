import { validateJsonSchema } from 'schema-validation';
import { WorkflowRuntimeError } from '../entities/errors.mjs';
import { loadOutputSchema, resolveOutputSchemaPath } from './output-schema.mjs';
import { formatSchemaErrors, workflowSchemas } from '../schemas/workflow-schema.mjs';

export { resolveOutputSchemaPath };

export const OUTPUT_SCHEMA_MAX_ATTEMPTS = 3;

export function readOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot }) {
  return loadOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot }).schema;
}

export function validateAgainstOutputSchema({ workflow, workflowPath, schemaRef, output, repositoryRoot }) {
  const schema = readOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot });
  let validation;
  try {
    validation = validateJsonSchema(schema, output, { schemas: workflowSchemas });
  } catch (error) {
    throw new WorkflowRuntimeError(`output schema validation failed: invalid output schema '${schemaRef}': ${error.message}`);
  }

  if (validation.ok) {
    const reservedErrors = [];
    if (!output || typeof output !== 'object' || Array.isArray(output)) reservedErrors.push('/ must be object');
    else {
      if (Object.hasOwn(output, 'artifacts') && !Array.isArray(output.artifacts)) reservedErrors.push('/artifacts must be array');
      if (Object.hasOwn(output, 'results') && !Array.isArray(output.results)) reservedErrors.push('/results must be array');
    }
    if (reservedErrors.length > 0) return { ok: false, errors: reservedErrors.join('; ') };
    return { ok: true, output: structuredClone(output), errors: [] };
  }
  return { ok: false, errors: formatSchemaErrors(validation.errors) };
}

export function outputSchemaRetryKey(stepId) {
  return `${stepId}:output.schema`;
}

export function validationRetryPrompt({ errors, attempt, maxAttempts = OUTPUT_SCHEMA_MAX_ATTEMPTS }) {
  return [
    `Previous output failed output.schema validation (attempt ${attempt}/${maxAttempts}).`,
    'Return strict JSON matching the declared output.schema and keep the routing fields required by the workflow.',
    `Validation errors: ${errors}`,
  ].join('\n');
}
