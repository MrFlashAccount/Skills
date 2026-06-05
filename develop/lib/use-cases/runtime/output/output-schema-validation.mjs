import { SchemaValidationError, formatSchemaErrors, validateJsonSchema } from 'schema-validation';
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { loadOutputSchema } from '../../../persistence/workflow-resources/output-schema-loader.mjs';

export const OUTPUT_SCHEMA_MAX_ATTEMPTS = 3;

function validateArtifactMetadataArray(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output) || !Object.hasOwn(output, 'artifacts') || !Array.isArray(output.artifacts)) return [];

  const errors = [];
  const forbiddenFields = ['type', 'kind', 'ref', 'producer_step_id', 'version', 'replaces', 'aliases'];
  for (const [index, artifact] of output.artifacts.entries()) {
    if (artifact && typeof artifact === 'object' && !Array.isArray(artifact)) {
      for (const field of forbiddenFields) {
        if (Object.hasOwn(artifact, field)) errors.push(`/artifacts/${index}/${field} is not allowed`);
      }
    }
  }
  const artifactSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/output-artifact-contract-check',
    $ref: 'https://github.com/MrFlashAccount/Skills/schemas/workflow/baton#/$defs/artifact',
  };
  for (const [index, artifact] of output.artifacts.entries()) {
    const validation = validateJsonSchema(artifactSchema, artifact, { schemas: [batonSchema] });
    if (!validation.ok) errors.push(...formatSchemaErrors(validation.errors).split('; ').map((error) => `/artifacts/${index}${error.startsWith('/') ? error : ` ${error}`}`));
  }
  return errors;
}

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
      reservedErrors.push(...validateArtifactMetadataArray(output));
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
