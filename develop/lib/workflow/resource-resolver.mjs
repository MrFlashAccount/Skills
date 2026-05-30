import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from './errors.mjs';
import { isInside } from './path-utils.mjs';

export function workflowResourceBase({ workflowPath }) {
  return path.dirname(path.resolve(workflowPath));
}

export function defaultRepositoryRootForWorkflow(workflowPath) {
  const workflowDir = workflowResourceBase({ workflowPath });
  const parentDir = path.dirname(workflowDir);
  if (path.basename(workflowDir) === 'workflows') return parentDir;
  if (path.basename(parentDir) === 'workflows') return path.dirname(parentDir);
  return workflowDir;
}

export function assertWorkflowFileRef({ fileRef, fieldName, kind, messagePrefix }) {
  if (typeof fileRef !== 'string' || fileRef.length === 0) {
    throw new WorkflowInterpreterError(`${messagePrefix}: ${fieldName} ${kind} reference is empty`);
  }
  if (path.isAbsolute(fileRef)) {
    throw new WorkflowInterpreterError(`${messagePrefix}: ${fieldName} ${kind} must be a local relative path: ${fileRef}`);
  }
}

export function resolveWorkflowFileRef({ workflowPath, fileRef, fieldName = 'file', kind = 'file', messagePrefix = 'workflow file resolution failed', missingMessage, repositoryRoot }) {
  assertWorkflowFileRef({ fileRef, fieldName, kind, messagePrefix });
  const base = workflowResourceBase({ workflowPath });
  const candidate = path.resolve(base, fileRef);
  const boundaryRoot = repositoryRoot ?? defaultRepositoryRootForWorkflow(workflowPath);
  const repositoryRealpath = realpathSync(boundaryRoot);
  const workflowBaseRealpath = realpathSync(base);
  const root = isInside(workflowBaseRealpath, repositoryRealpath) ? repositoryRealpath : workflowBaseRealpath;
  let resolvedPath;
  try {
    resolvedPath = realpathSync(candidate);
  } catch {
    throw new WorkflowInterpreterError(missingMessage ?? `${messagePrefix}: missing ${fieldName} ${kind} '${fileRef}'`);
  }
  if (root && !isInside(resolvedPath, root)) {
    throw new WorkflowInterpreterError(`${messagePrefix}: ${fieldName} ${kind} escapes repository root: ${fileRef}`);
  }
  return resolvedPath;
}

export function readWorkflowFileRef(options) {
  const resolvedPath = resolveWorkflowFileRef(options);
  return { content: readFileSync(resolvedPath, 'utf8'), path: resolvedPath };
}
