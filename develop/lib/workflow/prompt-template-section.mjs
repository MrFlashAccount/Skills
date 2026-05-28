import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { WorkflowInterpreterError } from './errors.mjs';
import { isInside, safeReadTemplate, trimStable, workflowSkillBase } from './prompt-render-utils.mjs';

export function readInputTemplate({ workflowPath, workflow, input, repositoryRoot, templateBaseDir }) {
  if (!input?.template) return { content: undefined, metadataPath: undefined };
  const workflowDir = path.dirname(path.resolve(workflowPath));
  const bases = [path.resolve(templateBaseDir ?? workflowDir)];
  const skillBase = workflowSkillBase({ workflow, repositoryRoot });
  if (skillBase) bases.push(skillBase);
  const resolved = safeReadTemplate({
    templateRef: input.template,
    fieldName: 'input',
    bases,
    repositoryRoot,
  });
  return { content: resolved.content, metadataPath: input.template };
}

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

export function defaultPrompt({ step }) {
  return `# ${step.name}\n`;
}

export function assertNoUnsupportedPlaceholders(promptLayer, templatePath) {
  const unsupported = promptLayer.match(/{{\s*[^{}]+?\s*}}/g);
  if (unsupported) {
    const source = templatePath ? ` in input template '${templatePath}'` : '';
    throw new WorkflowInterpreterError(`workflow prompt render failed: placeholders are unsupported${source}: ${unsupported[0]}`);
  }
}
