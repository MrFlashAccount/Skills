import path from 'node:path';
export { isInside, workflowSkillBase } from '../path-utils.mjs';

export function normalizeRepositoryRoot(repositoryRoot) {
  return path.resolve(repositoryRoot ?? process.cwd());
}

export function safeReadTemplate({ templateRef, fieldName, workflowPath, repositoryRoot, missingMessage, readWorkflowFileRef }) {
  if (typeof readWorkflowFileRef !== 'function') throw new Error('workflow prompt render failed: missing workflow file reader');
  return readWorkflowFileRef({
    workflowPath,
    fileRef: templateRef,
    fieldName,
    kind: 'template',
    messagePrefix: 'workflow prompt render failed',
    repositoryRoot,
    missingMessage,
  });
}

export function trimStable(value) {
  return value.trim().replace(/\r\n/g, '\n');
}

export function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}
