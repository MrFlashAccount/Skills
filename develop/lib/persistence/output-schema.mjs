import { readFileSync } from 'node:fs';
import { WorkflowRuntimeError } from '../entities/errors.mjs';
import { resolveWorkflowFileRef } from './resource-resolver.mjs';
export { workflowResourceBase } from './resource-resolver.mjs';

/**
 * Canonical output.schema path resolution used by both runtime validation and
 * prompt rendering. All relative refs use one base only: the directory
 * containing the active workflow file. Reusable shared resources must be
 * referenced with explicit workflow-relative traversal such as
 * `../../shared/...`; there is no repository-root or `shared/...` alias.
 */
function outputSchemaError(messagePrefix, message) {
  return new WorkflowRuntimeError(`${messagePrefix}: ${message}`);
}

export function resolveOutputSchemaPath({
  workflow,
  workflowPath,
  schemaRef,
  repositoryRoot,
  messagePrefix = 'output schema validation failed',
}) {
  return resolveWorkflowFileRef({
    workflowPath,
    fileRef: schemaRef,
    fieldName: 'output',
    kind: 'schema',
    messagePrefix,
    repositoryRoot,
    missingMessage: `${messagePrefix}: output.schema not found: ${schemaRef}`,
  });
}

export function loadOutputSchema({
  workflow,
  workflowPath,
  schemaRef,
  repositoryRoot,
  messagePrefix = 'output schema validation failed',
}) {
  const schemaPath = resolveOutputSchemaPath({ workflow, workflowPath, schemaRef, repositoryRoot, messagePrefix });
  try {
    return { schema: JSON.parse(readFileSync(schemaPath, 'utf8')), schemaPath };
  } catch (error) {
    throw outputSchemaError(messagePrefix, `invalid output schema JSON '${schemaRef}': ${error.message}`);
  }
}
