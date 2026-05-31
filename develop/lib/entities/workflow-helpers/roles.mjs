import path from 'node:path';
import { WorkflowRuntimeError } from '../errors.mjs';

export const REQUIRED_ROLE_MATERIAL_FILES = ['ROLE.md', 'RUBRIC.md'];

export function assertRoleDirectoryName(role, { errorPrefix = 'workflow role validation failed' } = {}) {
  if (typeof role !== 'string' || role.length === 0) return;
  if (!/^[A-Za-z0-9_-]+$/.test(role)) {
    throw new WorkflowRuntimeError(`${errorPrefix}: input.role must be a role directory name: ${role}`);
  }
}

export function roleMaterialPath(role, fileName) {
  return path.join('roles', role, fileName);
}
