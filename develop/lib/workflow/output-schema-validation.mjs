import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import batonSchema from '../../schemas/baton.json' with { type: 'json' };
import workerOutputSchema from '../../schemas/worker-output.json' with { type: 'json' };
import { WorkflowInterpreterError } from './errors.mjs';
import { formatSchemaErrors } from './schema-validation.mjs';

export const OUTPUT_SCHEMA_MAX_ATTEMPTS = 3;

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function workflowSkillBase({ workflow, repositoryRoot }) {
  const name = workflow?.name;
  if (typeof name !== 'string' || name.length === 0) return undefined;
  return path.join(repositoryRoot, 'skills', name);
}

function outputSchemaBases({ workflow, workflowPath, repositoryRoot }) {
  return [
    workflowSkillBase({ workflow, repositoryRoot }),
    repositoryRoot,
    path.dirname(path.resolve(workflowPath)),
  ].filter(Boolean);
}

export function resolveOutputSchemaPath({ workflow, workflowPath, schemaRef, repositoryRoot = process.cwd() }) {
  if (typeof schemaRef !== 'string' || schemaRef.length === 0) {
    throw new WorkflowInterpreterError('output schema validation failed: output.schema reference is empty');
  }
  if (path.isAbsolute(schemaRef)) {
    throw new WorkflowInterpreterError(`output schema validation failed: output.schema must be a local relative path: ${schemaRef}`);
  }

  const root = realpathSync(repositoryRoot);
  for (const base of outputSchemaBases({ workflow, workflowPath, repositoryRoot: root })) {
    const candidate = path.resolve(base, schemaRef);
    if (!isInside(candidate, root) && !isInside(candidate, realpathSync(path.dirname(path.resolve(workflowPath))))) continue;
    if (!existsSync(candidate)) continue;
    const realCandidate = realpathSync(candidate);
    if (!isInside(realCandidate, root) && !isInside(realCandidate, realpathSync(path.dirname(path.resolve(workflowPath))))) continue;
    return realCandidate;
  }

  throw new WorkflowInterpreterError(`output schema validation failed: output.schema not found: ${schemaRef}`);
}

export function readOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot = process.cwd() }) {
  const schemaPath = resolveOutputSchemaPath({ workflow, workflowPath, schemaRef, repositoryRoot });
  try {
    return JSON.parse(readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    throw new WorkflowInterpreterError(`output schema validation failed: invalid output schema JSON '${schemaRef}': ${error.message}`);
  }
}

export function validateAgainstOutputSchema({ workflow, workflowPath, schemaRef, output, repositoryRoot = process.cwd() }) {
  const schema = readOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot });
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(batonSchema);
  ajv.addSchema(workerOutputSchema);
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    throw new WorkflowInterpreterError(`output schema validation failed: invalid output schema '${schemaRef}': ${error.message}`);
  }

  if (validate(output)) return { ok: true, output: structuredClone(output), errors: [] };
  return { ok: false, errors: formatSchemaErrors(validate.errors) };
}

export function outputSchemaRetryKey(stepId) {
  return `${stepId}:output.schema`;
}

export function validationRetryPrompt({ errors, attempt, maxAttempts = OUTPUT_SCHEMA_MAX_ATTEMPTS }) {
  return [
    `Previous output failed output.schema validation (attempt ${attempt}/${maxAttempts}).`,
    'Return strict JSON matching the declared output.schema and keep the worker-output routing fields required by the workflow.',
    `Validation errors: ${errors}`,
  ].join('\n');
}
