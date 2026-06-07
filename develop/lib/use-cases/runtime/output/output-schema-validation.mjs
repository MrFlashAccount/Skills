import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { SchemaValidationError, formatSchemaErrors, validateJsonSchema } from 'schema-validation';
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { loadOutputSchema } from '../../../persistence/workflow-resources/output-schema-loader.mjs';

export const OUTPUT_SCHEMA_MAX_ATTEMPTS = 3;

function isInsideDirectory(filePath, directory) {
  const rel = relative(directory, filePath);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

function realPathPreservingMissingTail(pathname) {
  const segments = [];
  let current = resolve(pathname);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return resolve(pathname);
    segments.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync.native(current), ...segments);
}

function isSymlink(pathname) {
  try {
    return lstatSync(pathname).isSymbolicLink();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function validateArtifactPathBoundaries(output, artifactOutputDir) {
  if (artifactOutputDir === undefined || !output || typeof output !== 'object' || Array.isArray(output) || !Object.hasOwn(output, 'artifacts') || !Array.isArray(output.artifacts)) return [];

  const errors = [];
  const expectedDir = resolve(artifactOutputDir);
  const expectedDirIsSymlink = isSymlink(expectedDir);
  const realExpectedDir = expectedDirIsSymlink ? expectedDir : realPathPreservingMissingTail(expectedDir);
  for (const [index, artifact] of output.artifacts.entries()) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || typeof artifact.path !== 'string' || !isAbsolute(artifact.path)) continue;
    const artifactPath = resolve(artifact.path);
    if (!isInsideDirectory(artifactPath, expectedDir)) {
      errors.push(`/artifacts/${index}/path must be a file under artifact output directory: ${artifactOutputDir}`);
      continue;
    }
    if (expectedDirIsSymlink) {
      errors.push(`/artifacts/${index}/path must use the exact artifact output directory, not a symlink: ${artifactOutputDir}`);
      continue;
    }
    const realArtifactPath = realPathPreservingMissingTail(artifactPath);
    if (!isInsideDirectory(realArtifactPath, realExpectedDir)) errors.push(`/artifacts/${index}/path must not escape artifact output directory through symlinks: ${artifactOutputDir}`);
  }
  return errors;
}

function validateArtifactMetadataArray(output, artifactOutputDir) {
  if (!output || typeof output !== 'object' || Array.isArray(output) || !Object.hasOwn(output, 'artifacts') || !Array.isArray(output.artifacts)) return [];

  const errors = validateArtifactPathBoundaries(output, artifactOutputDir);
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

export function validateAgainstOutputSchema({ schemaRef = '<inline>', schema, output, externalSchemas = [], workflow, workflowPath, repositoryRoot, artifactOutputDir }) {
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
      reservedErrors.push(...validateArtifactMetadataArray(output, artifactOutputDir));
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
