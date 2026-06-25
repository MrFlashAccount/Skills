import { assertRoleDirectoryName } from '../../../../runtime/role-ref.mjs';
import { trimStable } from '../utils.mjs';

function roleMaterialRecords(resources, role) {
  const materials = resources?.roleMaterials ?? {};
  const loaded = materials instanceof Map ? materials.get(role) : materials[role];
  if (!loaded) throw new Error(`workflow prompt render failed: missing role material for input.role '${role}'`);
  return loaded instanceof Map ? [...loaded.values()] : Object.values(loaded);
}

export function readInputRole({ input, resources }) {
  const role = input?.role;
  if (!role) return { content: '', metadataPaths: [] };
  assertRoleDirectoryName(role, { errorPrefix: 'workflow prompt render failed' });
  const records = roleMaterialRecords(resources, role);
  for (const record of records) {
    if (typeof record?.content !== 'string') {
      const pathSuffix = record?.path ? `: ${record.path}` : '';
      throw new Error(`workflow prompt render failed: missing role material for input.role '${role}'${pathSuffix}`);
    }
  }
  const sections = [role, ''];
  for (const record of records) {
    sections.push(`<!-- role material: ${record.path} -->`, trimStable(record.content), '');
  }
  if (sections.at(-1) === '') sections.pop();
  return { content: sections.join('\n'), metadataPaths: records.map((record) => record.path) };
}
