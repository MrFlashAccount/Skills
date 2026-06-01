/** Filesystem catalog for repository-local workflow role material directories. */
import { existsSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { REQUIRED_ROLE_MATERIAL_FILES, isRoleDirectoryName } from '../resource-helpers/role-material.mjs';

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
    .filter(isRoleDirectoryName)
    .filter((role) => REQUIRED_ROLE_MATERIAL_FILES.every((fileName) => existsSync(path.join(rolesRoot, role, fileName))))
    .sort();
}
