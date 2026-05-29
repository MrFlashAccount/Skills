import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from '../errors.mjs';

export function normalizeRepositoryRoot(repositoryRoot) {
  return path.resolve(repositoryRoot ?? process.cwd());
}

function assertRelativeLocalRef(localRef, fieldName, kind) {
  if (typeof localRef !== 'string' || localRef.length === 0) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: ${fieldName} ${kind} reference is empty`);
  }
  if (path.isAbsolute(localRef)) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: ${fieldName} ${kind} must be a local relative path: ${localRef}`);
  }
}

export function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function safeReadLocalFile({ fileRef, fieldName, kind, bases, repositoryRoot, missingMessage, allowedRoots }) {
  assertRelativeLocalRef(fileRef, fieldName, kind);
  const root = realpathSync(repositoryRoot);
  const confinementRoots = (allowedRoots?.length ? allowedRoots : [root]).map((allowedRoot) => realpathSync(allowedRoot));
  const attempted = [];

  function isInsideAllowed(candidate) {
    return confinementRoots.some((allowedRoot) => isInside(candidate, allowedRoot));
  }

  for (const base of bases) {
    const candidate = path.resolve(base, fileRef);
    attempted.push(candidate);
    if (!isInsideAllowed(candidate)) {
      throw new WorkflowInterpreterError(
        `workflow prompt render failed: ${fieldName} ${kind} escapes repository root: ${fileRef}`,
      );
    }
    let realCandidate;
    try {
      realCandidate = realpathSync(candidate);
    } catch {
      continue;
    }
    if (!isInsideAllowed(realCandidate)) {
      throw new WorkflowInterpreterError(
        `workflow prompt render failed: ${fieldName} ${kind} escapes repository root: ${fileRef}`,
      );
    }
    return { content: readFileSync(realCandidate, 'utf8'), path: path.relative(root, realCandidate) };
  }

  throw new WorkflowInterpreterError(missingMessage ?? `workflow prompt render failed: missing ${fieldName} ${kind} '${fileRef}' (tried ${attempted.join(', ')})`);
}

export function safeReadTemplate({ templateRef, fieldName, bases, repositoryRoot, missingMessage }) {
  return safeReadLocalFile({ fileRef: templateRef, fieldName, kind: 'template', bases, repositoryRoot, missingMessage });
}

export function safeReadSchema({ schemaRef, fieldName, bases, repositoryRoot, allowedRoots }) {
  return safeReadLocalFile({ fileRef: schemaRef, fieldName, kind: 'schema', bases, repositoryRoot, allowedRoots });
}

export function workflowSkillBase({ workflow, repositoryRoot }) {
  const name = workflow?.name;
  if (typeof name !== 'string' || name.length === 0) return undefined;
  return path.join(repositoryRoot, 'skills', name);
}

export function trimStable(value) {
  return value.trim().replace(/\r\n/g, '\n');
}

export function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}
