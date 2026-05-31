import { trimStable } from '../utils.mjs';

export function readInputRole({ input, repositoryRoot, assertRoleDirectoryName, readRoleMaterialFile }) {
  const role = input?.role;
  if (!role) return { content: '', metadataPaths: [] };
  if (typeof assertRoleDirectoryName !== 'function' || typeof readRoleMaterialFile !== 'function') throw new Error('workflow prompt render failed: missing role material reader');
  assertRoleDirectoryName(role, { errorPrefix: 'workflow prompt render failed' });
  const roleFile = readRoleMaterialFile({ repositoryRoot, role, fileName: 'ROLE.md' });
  const rubricFile = readRoleMaterialFile({ repositoryRoot, role, fileName: 'RUBRIC.md' });
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
