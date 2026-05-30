import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from './errors.mjs';

/**
 * Canonical output.schema path resolution used by both runtime validation and
 * prompt rendering. Candidate bases may fail confinement or existence checks;
 * resolution keeps searching so base ordering cannot make one path fail while
 * another workflow-relative candidate would succeed.
 */
export function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function workflowSkillBase({ workflow, repositoryRoot }) {
  const name = workflow?.name;
  if (typeof name !== 'string' || name.length === 0) return undefined;
  return path.join(repositoryRoot, 'skills', name);
}

export function outputSchemaBases({ workflow, workflowPath, repositoryRoot }) {
  const bases = [];
  const skillBase = workflowSkillBase({ workflow, repositoryRoot });
  if (skillBase) bases.push(skillBase);
  if (workflowPath) bases.push(path.dirname(path.resolve(workflowPath)));
  bases.push(repositoryRoot);
  return bases;
}

export function outputSchemaAllowedRoots({ workflowPath, repositoryRoot }) {
  const roots = [repositoryRoot];
  if (workflowPath) roots.push(path.dirname(path.resolve(workflowPath)));
  return roots;
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

  const root = realpathSync(repositoryRoot);
  const allowedRoots = outputSchemaAllowedRoots({ workflowPath, repositoryRoot: root }).map((allowedRoot) => realpathSync(allowedRoot));
  const bases = outputSchemaBases({ workflow, workflowPath, repositoryRoot: root });

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
