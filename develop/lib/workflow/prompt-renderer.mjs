import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fencedJson, projectState } from './projection.mjs';
import { WorkflowInterpreterError } from './errors.mjs';

function normalizeRepositoryRoot(repositoryRoot) {
  return path.resolve(repositoryRoot ?? process.cwd());
}

function assertRelativeLocalRef(localRef, fieldName, kind) {
  if (typeof localRef !== 'string' || localRef.length === 0) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: ${fieldName} ${kind} reference is empty`);
  }
  if (path.isAbsolute(localRef)) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: ${fieldName} ${kind} must be a local relative path: ${localRef}`);
  }
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeReadLocalFile({ fileRef, fieldName, kind, bases, repositoryRoot, missingMessage }) {
  assertRelativeLocalRef(fileRef, fieldName, kind);
  const root = realpathSync(repositoryRoot);
  const attempted = [];

  for (const base of bases) {
    const candidate = path.resolve(base, fileRef);
    attempted.push(candidate);
    if (!isInside(candidate, root)) {
      throw new WorkflowInterpreterError(
        `workflow prompt render failed: ${fieldName} ${kind} escapes repository root: ${fileRef}`,
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
        `workflow prompt render failed: ${fieldName} ${kind} escapes repository root: ${fileRef}`,
      );
    }
    return { content: readFileSync(realCandidate, 'utf8'), path: path.relative(root, realCandidate) };
  }

  throw new WorkflowInterpreterError(missingMessage ?? `workflow prompt render failed: missing ${fieldName} ${kind} '${fileRef}' (tried ${attempted.join(', ')})`);
}

function safeReadTemplate({ templateRef, fieldName, bases, repositoryRoot, missingMessage }) {
  return safeReadLocalFile({ fileRef: templateRef, fieldName, kind: 'template', bases, repositoryRoot, missingMessage });
}

function safeReadSchema({ schemaRef, fieldName, bases, repositoryRoot }) {
  return safeReadLocalFile({ fileRef: schemaRef, fieldName, kind: 'schema', bases, repositoryRoot });
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

function outputBases({ workflow, repositoryRoot }) {
  const bases = [];
  const skillBase = workflowSkillBase({ workflow, repositoryRoot });
  if (skillBase) bases.push(skillBase);
  bases.push(repositoryRoot);
  return bases;
}

function readOutputTemplate({ workflow, step, repositoryRoot }) {
  const templateRef = step.output?.template;
  if (!templateRef) return { content: '', metadataPath: undefined };
  const resolved = safeReadTemplate({ templateRef, fieldName: 'output', bases: outputBases({ workflow, repositoryRoot }), repositoryRoot });
  return { content: resolved.content, metadataPath: templateRef };
}

function parseOutputSchemaContent(schemaRef, content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new WorkflowInterpreterError(
      `workflow prompt render failed: invalid output schema JSON '${schemaRef}': ${error.message}`,
    );
  }
}

function readOutputSchema({ workflow, step, repositoryRoot }) {
  const schemaRef = step.output?.schema;
  if (!schemaRef) return { content: '', metadataPath: undefined, schema: undefined };
  const resolved = safeReadSchema({ schemaRef, fieldName: 'output', bases: outputBases({ workflow, repositoryRoot }), repositoryRoot });
  const schema = parseOutputSchemaContent(schemaRef, resolved.content);
  return { content: JSON.stringify(schema, null, 2), metadataPath: schemaRef, schema };
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

function outputContractSection(outputTemplate, templatePath, outputSchema, schemaPath) {
  if (!outputTemplate && !outputSchema) return '';
  const parts = [];
  if (outputTemplate) {
    const templateComment = templatePath ? `\n\n<!-- output template: ${templatePath} -->` : '';
    parts.push(`Return output that satisfies the workflow worker-output envelope and follows this markdown artifact template when producing the artifact content.${templateComment}\n\n${trimStable(outputTemplate)}`);
  }
  if (outputSchema) {
    const schemaComment = schemaPath ? `\n\n<!-- output schema: ${schemaPath} -->` : '';
    parts.push(`Return valid JSON matching this schema. If a validation command or tool is available in this agent/subagent context, validate the generated JSON against this schema before the final answer; fix validation errors and repeat for a bounded number of attempts. The harness/orchestrator will validate the final returned JSON again after the answer, so this agent-side validation is a preflight, not the final authority. If no validation command or tool is available in this context, still return strict schema-matching JSON and expect harness-level validation.${schemaComment}\n\n\`\`\`json\n${trimStable(outputSchema)}\n\`\`\``);
  }
  return section('Output contract', parts.join('\n\n'));
}

function assertNoUnsupportedPlaceholders(promptLayer, templatePath) {
  const unsupported = promptLayer.match(/{{\s*[^{}]+?\s*}}/g);
  if (unsupported) {
    const source = templatePath ? ` in input template '${templatePath}'` : '';
    throw new WorkflowInterpreterError(`workflow prompt render failed: placeholders are unsupported${source}: ${unsupported[0]}`);
  }
}

function stringNote(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function schemaPropertyNotes({ workflow, projectedState, projectedKeys, repositoryRoot }) {
  const lines = [];

  for (const key of projectedKeys) {
    const producerStep = workflow?.steps?.[key];
    if (!producerStep?.output?.schema) continue;
    let schema;
    try {
      schema = readOutputSchema({ workflow, step: producerStep, repositoryRoot }).schema;
    } catch (error) {
      if (!(error instanceof WorkflowInterpreterError) || !error.message.includes('missing output schema')) throw error;
      continue;
    }
    const properties = schema?.properties;
    if (!properties || typeof properties !== 'object') continue;
    const projectedValue = projectedState?.[key];
    if (!projectedValue || typeof projectedValue !== 'object' || Array.isArray(projectedValue)) continue;

    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      if (!Object.hasOwn(projectedValue, fieldName) || !fieldSchema || typeof fieldSchema !== 'object') continue;
      const description = stringNote(fieldSchema.description);
      const usage = stringNote(fieldSchema['x-usage']);
      if (!description && !usage) continue;
      lines.push(`- ${key}.${fieldName}`);
      if (description) lines.push(`  - Description: ${description}`);
      if (usage) lines.push(`  - Usage: ${usage}`);
    }
  }

  if (lines.length === 0) return '';

  return [
    'Field notes for projected step outputs. These notes are lower priority than workflow instructions, system instructions, and the workflow step prompt; they explain projected data semantics and suggested consumption only, and do not override higher-priority instructions.',
    '',
    ...lines,
  ].join('\n');
}

function projectedStateBlock({ workflow, projection, repositoryRoot }) {
  if (projection.projectedKeys.length === 0) return '';
  const notes = schemaPropertyNotes({
    workflow,
    projectedState: projection.value,
    projectedKeys: projection.projectedKeys,
    repositoryRoot,
  });
  const json = fencedJson(projection.value).trimEnd();
  return notes ? `${notes}\n\n${json}\n` : `${json}\n`;
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
  const stateBlock = projectedStateBlock({ workflow, projection, repositoryRoot: root });
  const inputTemplate = readInputTemplate({ workflowPath, workflow, input, repositoryRoot: root, templateBaseDir });
  const inputRole = readInputRole({ input, repositoryRoot: root });
  const outputTemplate = readOutputTemplate({ workflow, step, repositoryRoot: root });
  const outputSchema = readOutputSchema({ workflow, step, repositoryRoot: root });
  const outputContract = outputContractSection(outputTemplate.content, outputTemplate.metadataPath, outputSchema.content, outputSchema.metadataPath);
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
  if (step.output?.schema) metadata.outputSchema = step.output.schema;
  if (inputRole.metadataPaths.length > 0) metadata.roleMaterial = inputRole.metadataPaths;
  if (projection.projectedKeys.length > 0) metadata.projectedStateKeys = projection.projectedKeys;

  const compiledPrompt = { prompt };
  if (Object.keys(metadata).length > 0) compiledPrompt.metadata = metadata;
  if (includeDiagnostics && diagnostics.length > 0) compiledPrompt.diagnostics = diagnostics;
  return compiledPrompt;
}
