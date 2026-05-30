import path from 'node:path';
import { readWorkflowFileRef } from '../resource-resolver.mjs';
export { isInside, workflowSkillBase } from '../path-utils.mjs';
export { readWorkflowFileRef, workflowResourceBase } from '../resource-resolver.mjs';

export function normalizeRepositoryRoot(repositoryRoot) {
  return path.resolve(repositoryRoot ?? process.cwd());
}

export function safeReadTemplate({ templateRef, fieldName, workflowPath, missingMessage }) {
  return readWorkflowFileRef({
    workflowPath,
    fileRef: templateRef,
    fieldName,
    kind: 'template',
    messagePrefix: 'workflow prompt render failed',
    missingMessage,
  });
}

export function trimStable(value) {
  return value.trim().replace(/\r\n/g, '\n');
}

export function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}
