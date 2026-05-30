import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from './errors.mjs';
import { isInside } from './path-utils.mjs';
export { isInside } from './path-utils.mjs';

/**
 * Canonical output.schema path resolution used by both runtime validation and
 * prompt rendering. Plain relative refs use one base only: the directory
 * containing the active workflow file, confined to that workflow package
 * directory. Explicit shared refs (`shared/...`) resolve from the repository
 * root and are confined to the repository shared tree.
 */
export function workflowResourceBase({ workflowPath }) {
  return path.dirname(path.resolve(workflowPath));
}

export function sharedResourceBase({ repositoryRoot }) {
  return path.join(path.resolve(repositoryRoot ?? process.cwd()), 'shared');
}

export function outputSchemaBases({ workflowPath, schemaRef, repositoryRoot }) {
  if (typeof schemaRef === 'string' && schemaRef.startsWith('shared/')) return [path.resolve(repositoryRoot ?? process.cwd())];
  return [workflowResourceBase({ workflowPath })];
}

export function outputSchemaAllowedRoots({ workflowPath, schemaRef, repositoryRoot }) {
  if (typeof schemaRef === 'string' && schemaRef.startsWith('shared/')) return [sharedResourceBase({ repositoryRoot })];
  return [workflowResourceBase({ workflowPath })];
}

function outputSchemaError(messagePrefix, message) {
  return new WorkflowInterpreterError(`${messagePrefix}: ${message}`);
}

function assertOutputSchemaRef({ schemaRef, messagePrefix }) {
  if (typeof schemaRef !== 'string' || schemaRef.length === 0) {
    throw outputSchemaError(messagePrefix, 'output.schema reference is empty');
  }
  if (path.isAbsolute(schemaRef)) {
    throw outputSchemaError(messagePrefix, `output.schema must be a local relative path: ${schemaRef}`);
  }
}

export function resolveOutputSchemaPath({
  workflow,
  workflowPath,
  schemaRef,
  repositoryRoot = process.cwd(),
  messagePrefix = 'output schema validation failed',
}) {
  assertOutputSchemaRef({ schemaRef, messagePrefix });

  const allowedRoots = outputSchemaAllowedRoots({ workflowPath, schemaRef, repositoryRoot }).map((allowedRoot) => realpathSync(allowedRoot));
  const bases = outputSchemaBases({ workflowPath, schemaRef, repositoryRoot });

  function isInsideAllowed(candidate) {
    return allowedRoots.some((allowedRoot) => isInside(candidate, allowedRoot));
  }

  for (const base of bases) {
    const candidate = path.resolve(base, schemaRef);
    if (!isInsideAllowed(candidate)) continue;
    if (!existsSync(candidate)) continue;
    const realCandidate = realpathSync(candidate);
    if (!isInsideAllowed(realCandidate)) continue;
    return realCandidate;
  }

  throw outputSchemaError(messagePrefix, `output.schema not found: ${schemaRef}`);
}

export function loadOutputSchema({
  workflow,
  workflowPath,
  schemaRef,
  repositoryRoot = process.cwd(),
  messagePrefix = 'output schema validation failed',
}) {
  const schemaPath = resolveOutputSchemaPath({ workflow, workflowPath, schemaRef, repositoryRoot, messagePrefix });
  try {
    return { schema: JSON.parse(readFileSync(schemaPath, 'utf8')), schemaPath };
  } catch (error) {
    throw outputSchemaError(messagePrefix, `invalid output schema JSON '${schemaRef}': ${error.message}`);
  }
}
