import { SchemaValidationError, formatSchemaErrors, validateJsonSchema } from '../../../schema-kernel/index.mjs';
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { loadOutputSchema } from '../../../persistence/workflow-resources/output-schema-loader.mjs';

export const OUTPUT_SCHEMA_MAX_ATTEMPTS = 3;

export function validateAgainstOutputSchema({ schemaRef = '<inline>', schema, output, externalSchemas = [], workflow, workflowPath, repositoryRoot }) {
  const resolvedSchema = schema ?? ((workflow && workflowPath)
    ? loadOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot }).schema
    : undefined);
  if (resolvedSchema === undefined) throw new SchemaValidationError(`output schema validation failed: missing loaded output schema '${schemaRef}'`);
  let validation;
  try {
    validation = validateJsonSchema(resolvedSchema, output, { schemas: [batonSchema, ...externalSchemas] });
  } catch (error) {
    throw new SchemaValidationError(`output schema validation failed: invalid output schema '${schemaRef}': ${error.message}`);
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
