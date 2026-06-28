import { isAbsolute, resolve } from 'node:path';

export const absoluteWorkflowPathBoundaryMessage = 'workflow path must be absolute across the workflow-runner command boundary; resolve the workflow through workflow-catalog and pass the absolute catalog path';

export function assertAbsoluteWorkflowPath(workflowPath) {
  if (workflowPath === undefined) return undefined;
  if (typeof workflowPath !== 'string' || workflowPath.length === 0) throw new Error('workflow path must be a non-empty absolute path');
  if (!isAbsolute(workflowPath)) throw new Error(absoluteWorkflowPathBoundaryMessage);
  return workflowPath;
}

export function resolveAbsoluteWorkflowPath(workflowPath) {
  const absolutePath = assertAbsoluteWorkflowPath(workflowPath);
  return absolutePath === undefined ? undefined : resolve(absolutePath);
}
