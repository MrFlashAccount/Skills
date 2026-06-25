/** Filesystem catalog for repository-local workflow role material directories. */
import { existsSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isRoleDirectoryName } from '../../runtime/role-ref.mjs';

export const REQUIRED_WORKFLOW_ROLE_MATERIAL_FILES = ['ROLE.md', 'RUBRIC.md'];

export function workflowRoleMaterialPath(role, fileName) {
  return path.join('roles', role, fileName);
}

function roleCatalog(names, { loaded }) {
  Object.defineProperty(names, 'loaded', { value: loaded, enumerable: false });
  return names;
}

export function listAllowedWorkflowRoles({ repositoryRoot }) {
  const root = realpathSync(repositoryRoot);
  const rolesRoot = path.join(root, 'roles');
  let entries;
  try {
    entries = readdirSync(rolesRoot, { withFileTypes: true });
  } catch {
    return roleCatalog([], { loaded: false });
  }
  return roleCatalog(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(isRoleDirectoryName)
    .filter((role) => REQUIRED_WORKFLOW_ROLE_MATERIAL_FILES.every((fileName) => existsSync(path.join(rolesRoot, role, fileName))))
    .sort(), { loaded: true });
}
