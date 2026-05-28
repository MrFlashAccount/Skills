import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from '../../errors.mjs';
import { isInside, trimStable } from '../utils.mjs';

function assertRoleName(role) {
  if (typeof role !== 'string' || role.length === 0) return;
  if (!/^[A-Za-z0-9_-]+$/.test(role)) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: input.role must be a role directory name: ${role}`);
  }
}

function readRoleFile({ repositoryRoot, role, fileName }) {
  const root = realpathSync(repositoryRoot);
  const relativePath = path.join('roles', role, fileName);
  const candidate = path.join(root, relativePath);
  let realCandidate;
  try {
    realCandidate = realpathSync(candidate);
  } catch {
    throw new WorkflowInterpreterError(
      `workflow prompt render failed: missing role material for input.role '${role}': ${relativePath}`,
    );
  }
  if (!isInside(realCandidate, root)) {
    throw new WorkflowInterpreterError(
      `workflow prompt render failed: input.role material escapes repository root: ${relativePath}`,
    );
  }
  return { content: readFileSync(realCandidate, 'utf8'), path: path.relative(root, realCandidate) };
}

export function readInputRole({ input, repositoryRoot }) {
  const role = input?.role;
  if (!role) return { content: '', metadataPaths: [] };
  assertRoleName(role);
  const roleFile = readRoleFile({ repositoryRoot, role, fileName: 'ROLE.md' });
  const rubricFile = readRoleFile({ repositoryRoot, role, fileName: 'RUBRIC.md' });
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
