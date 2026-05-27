import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fencedJson, projectState } from './projection.mjs';
import { WorkflowInterpreterError } from './errors.mjs';

function normalizeRepositoryRoot(repositoryRoot) {
  return path.resolve(repositoryRoot ?? process.cwd());
}

function assertRelativeTemplateRef(templateRef, fieldName) {
  if (typeof templateRef !== 'string' || templateRef.length === 0) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: ${fieldName} template reference is empty`);
  }
  if (path.isAbsolute(templateRef)) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: ${fieldName} template must be a local relative path: ${templateRef}`);
  }
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeReadTemplate({ templateRef, fieldName, bases, repositoryRoot, missingMessage }) {
  assertRelativeTemplateRef(templateRef, fieldName);
  const root = realpathSync(repositoryRoot);
  const attempted = [];

  for (const base of bases) {
    const candidate = path.resolve(base, templateRef);
    attempted.push(candidate);
    if (!isInside(candidate, root)) {
      throw new WorkflowInterpreterError(
        `workflow prompt render failed: ${fieldName} template escapes repository root: ${templateRef}`,
      );
    }
    let realCandidate;
    try {
      realCandidate = realpathSync(candidate);
    } catch {
      continue;
    }
    if (!isInside(realCandidate, root)) {
      throw new WorkflowInterpreterError(
        `workflow prompt render failed: ${fieldName} template escapes repository root: ${templateRef}`,
      );
    }
    return { content: readFileSync(realCandidate, 'utf8'), path: path.relative(root, realCandidate) };
  }

  throw new WorkflowInterpreterError(missingMessage ?? `workflow prompt render failed: missing ${fieldName} template '${templateRef}' (tried ${attempted.join(', ')})`);
}

function workflowSkillBase({ workflow, repositoryRoot }) {
  const name = workflow?.name;
  if (typeof name !== 'string' || name.length === 0) return undefined;
  return path.join(repositoryRoot, 'skills', name);
}

function readInputTemplate({ workflowPath, workflow, input, repositoryRoot, templateBaseDir }) {
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

function readOutputTemplate({ workflow, step, repositoryRoot }) {
  const templateRef = step.output?.template;
  if (!templateRef) return { content: '', metadataPath: undefined };
  const bases = [];
  const skillBase = workflowSkillBase({ workflow, repositoryRoot });
  if (skillBase) bases.push(skillBase);
  bases.push(repositoryRoot);
  const resolved = safeReadTemplate({ templateRef, fieldName: 'output', bases, repositoryRoot });
  return { content: resolved.content, metadataPath: templateRef };
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

function readInputRole({ input, repositoryRoot }) {
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

function trimStable(value) {
  return value.trim().replace(/\r\n/g, '\n');
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}

function firstNonEmptyString(candidates) {
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value?.trim() ?? '';
}

function workflowInstruction({ workflow }) {
  return firstNonEmptyString([workflow?.instruction, workflow?.instructions]);
}

function concreteUserTask({ workflow }) {
  return firstNonEmptyString([workflow?.userTask, workflow?.userRequest, workflow?.task, workflow?.request]);
}

function finalOutputReminder(outputContract) {
  return outputContract ? section('Final reminder', 'Return exactly according to the output contract above.') : '';
}

function outputContractSection(outputTemplate, templatePath) {
  if (!outputTemplate) return '';
  const templateComment = templatePath ? `\n\n<!-- output template: ${templatePath} -->` : '';
  const body = `Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.${templateComment}\n\n${trimStable(outputTemplate)}`;
  return section('Output contract', body);
}

function assertNoUnsupportedPlaceholders(promptLayer, templatePath) {
  const unsupported = promptLayer.match(/{{\s*[^{}]+?\s*}}/g);
  if (unsupported) {
    const source = templatePath ? ` in input template '${templatePath}'` : '';
    throw new WorkflowInterpreterError(`workflow prompt render failed: placeholders are unsupported${source}: ${unsupported[0]}`);
  }
}

function assembleFixedPrompt({ promptLayer, templatePath, workflowInstructionBlock, inlinePrompt, roleBlock, stateBlock, outputContract, userTask, finalReminder }) {
  assertNoUnsupportedPlaceholders(promptLayer, templatePath);
  const parts = [trimStable(promptLayer)];

  if (workflowInstructionBlock) parts.push(section('Workflow instruction', workflowInstructionBlock).trimEnd());
  if (roleBlock) parts.push(section('Role material', roleBlock).trimEnd());
  if (outputContract) parts.push(outputContract.trimEnd());
  if (stateBlock) parts.push(section('Projected baton state', stateBlock).trimEnd());
  if (inlinePrompt) parts.push(section('Workflow step prompt', inlinePrompt.trim()));
  if (userTask) parts.push(section('Concrete user task', userTask).trimEnd());
  if (finalReminder) parts.push(finalReminder.trimEnd());

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

function defaultPrompt({ step }) {
  return `# ${step.name}\n`;
}

export function renderWorkflowPrompt({ workflowPath, workflow, baton, stepId, step, repositoryRoot, templateBaseDir, includeDiagnostics = false } = {}) {
  const root = normalizeRepositoryRoot(repositoryRoot ?? path.resolve(path.dirname(path.resolve(workflowPath)), '..'));
  const input = step.input ?? {};
  const selectors = input.state ?? [];
  const projection = projectState({ batonState: baton.state ?? {}, selectors, stepId });
  const stateBlock = projection.projectedKeys.length > 0 ? fencedJson(projection.value) : '';
  const inputTemplate = readInputTemplate({ workflowPath, workflow, input, repositoryRoot: root, templateBaseDir });
  const inputRole = readInputRole({ input, repositoryRoot: root });
  const outputTemplate = readOutputTemplate({ workflow, step, repositoryRoot: root });
  const outputContract = outputContractSection(outputTemplate.content, outputTemplate.metadataPath);
  const workflowInstructionBlock = workflowInstruction({ workflow });
  const userTask = concreteUserTask({ workflow });
  const finalReminder = finalOutputReminder(outputContract);

  const usesDefaultPrompt = inputTemplate.content === undefined;
  const promptLayer = usesDefaultPrompt ? defaultPrompt({ step, input }) : inputTemplate.content;
  const prompt = assembleFixedPrompt({
    promptLayer,
    templatePath: inputTemplate.metadataPath,
    workflowInstructionBlock,
    inlinePrompt: input.prompt ?? '',
    roleBlock: inputRole.content,
    stateBlock,
    outputContract,
    userTask,
    finalReminder,
  });
  const diagnostics = usesDefaultPrompt
    ? [
        {
          severity: 'info',
          code: 'default_prompt_used',
          message: 'No input.template declared; assembled deterministic default prompt.',
        },
      ]
    : [];

  const metadata = {};
  if (input.template) metadata.inputTemplate = input.template;
  if (step.output?.template) metadata.outputTemplate = step.output.template;
  if (inputRole.metadataPaths.length > 0) metadata.roleMaterial = inputRole.metadataPaths;
  if (projection.projectedKeys.length > 0) metadata.projectedStateKeys = projection.projectedKeys;

  const compiledPrompt = { prompt };
  if (Object.keys(metadata).length > 0) compiledPrompt.metadata = metadata;
  if (includeDiagnostics && diagnostics.length > 0) compiledPrompt.diagnostics = diagnostics;
  return compiledPrompt;
}
