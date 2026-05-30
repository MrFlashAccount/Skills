import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from './errors.mjs';

export function workflowResourceBase({ workflowPath }) {
  return path.dirname(path.resolve(workflowPath));
}

export function assertWorkflowFileRef({ fileRef, fieldName, kind, messagePrefix }) {
  if (typeof fileRef !== 'string' || fileRef.length === 0) {
    throw new WorkflowInterpreterError(`${messagePrefix}: ${fieldName} ${kind} reference is empty`);
  }
  if (path.isAbsolute(fileRef)) {
    throw new WorkflowInterpreterError(`${messagePrefix}: ${fieldName} ${kind} must be a local relative path: ${fileRef}`);
  }
}

export function resolveWorkflowFileRef({ workflowPath, fileRef, fieldName = 'file', kind = 'file', messagePrefix = 'workflow file resolution failed', missingMessage }) {
  assertWorkflowFileRef({ fileRef, fieldName, kind, messagePrefix });
  const candidate = path.resolve(workflowResourceBase({ workflowPath }), fileRef);
  try {
    return realpathSync(candidate);
  } catch {
    throw new WorkflowInterpreterError(missingMessage ?? `${messagePrefix}: missing ${fieldName} ${kind} '${fileRef}'`);
  }
}

export function readWorkflowFileRef(options) {
  const resolvedPath = resolveWorkflowFileRef(options);
  return { content: readFileSync(resolvedPath, 'utf8'), path: resolvedPath };
}
