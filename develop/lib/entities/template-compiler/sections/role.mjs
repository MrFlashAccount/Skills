import { assertRoleDirectoryName, roleMaterialPath, REQUIRED_ROLE_MATERIAL_FILES } from '../../role-utils.mjs';
import { trimStable } from '../utils.mjs';

function roleMaterial(resources, role, fileName) {
  const relativePath = roleMaterialPath(role, fileName);
  const materials = resources?.roleMaterials ?? {};
  const byRole = materials instanceof Map ? materials.get(role) : materials[role];
  const loaded = byRole instanceof Map ? byRole.get(fileName) : byRole?.[fileName];
  if (!loaded) throw new Error(`workflow prompt render failed: missing role material for input.role '${role}': ${relativePath}`);
  return typeof loaded === 'string' ? { content: loaded, path: relativePath } : { content: loaded.content, path: loaded.path ?? relativePath };
}

export function readInputRole({ input, resources }) {
  const role = input?.role;
  if (!role) return { content: '', metadataPaths: [] };
  assertRoleDirectoryName(role, { errorPrefix: 'workflow prompt render failed' });
  const [roleFileName, rubricFileName] = REQUIRED_ROLE_MATERIAL_FILES;
  const roleFile = roleMaterial(resources, role, roleFileName);
  const rubricFile = roleMaterial(resources, role, rubricFileName);
  const content = [
    role,
    '',
    `<!-- role material: ${roleFile.path} -->`,
    trimStable(roleFile.content),
    '',
    `<!-- role material: ${rubricFile.path} -->`,
    trimStable(rubricFile.content),
  ].join('\n');
  return { content, metadataPaths: [roleFile.path, rubricFile.path] };
}
