import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { WorkflowRuntimeError } from './errors.mjs';
import { isInside } from './template-compiler/utils.mjs';

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

export function readRoleMaterialFile({ repositoryRoot, role, fileName, errorPrefix = 'workflow prompt render failed' }) {
  const root = realpathSync(repositoryRoot);
  const relativePath = roleMaterialPath(role, fileName);
  const candidate = path.join(root, relativePath);
  let realCandidate;
  try {
    realCandidate = realpathSync(candidate);
  } catch {
    throw new WorkflowRuntimeError(`${errorPrefix}: missing role material for input.role '${role}': ${relativePath}`);
  }
  if (!isInside(realCandidate, root)) {
    throw new WorkflowRuntimeError(`${errorPrefix}: input.role material escapes repository root: ${relativePath}`);
  }
  return { content: readFileSync(realCandidate, 'utf8'), path: path.relative(root, realCandidate) };
}

export function listAllowedWorkflowRoles({ repositoryRoot }) {
  const root = realpathSync(repositoryRoot);
  const rolesRoot = path.join(root, 'roles');
  let entries;
  try {
    entries = readdirSync(rolesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((role) => /^[A-Za-z0-9_-]+$/.test(role))
    .filter((role) => REQUIRED_ROLE_MATERIAL_FILES.every((fileName) => existsSync(path.join(rolesRoot, role, fileName))))
    .sort();
}
