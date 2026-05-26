import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { actionForStep } from './model.mjs';
import { fencedJson, projectState } from './projection.mjs';
import { WorkflowInterpreterError } from './errors.mjs';

const PLACEHOLDER_VALUES = new Set([
  'step.id',
  'step.name',
  'step.kind',
  'input.prompt',
  'input.role',
  'state',
  'output.template',
]);

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

function replacePlaceholders(template, values) {
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (match, name) => {
    if (!PLACEHOLDER_VALUES.has(name)) return match;
    return values[name] ?? '';
  });
}

function assertNoUnresolvedPlaceholders(prompt) {
  const unresolved = prompt.match(/{{\s*[^{}]+?\s*}}/g);
  if (unresolved) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: unresolved placeholder ${unresolved[0]}`);
  }
}

function trimStable(value) {
  return value.trim().replace(/\r\n/g, '\n');
}

function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}

function appendMissingSections({ prompt, inlinePrompt, stateBlock, outputTemplate, inputTemplateContent }) {
  const parts = [trimStable(prompt)];
  const template = inputTemplateContent ?? '';

  if (!template.includes('{{input.prompt}}') && inlinePrompt) parts.push(section('Task', inlinePrompt.trim()));
  if (!template.includes('{{state}}')) parts.push(section('Projected baton state', stateBlock).trimEnd());
  if (!template.includes('{{output.template}}') && outputTemplate) parts.push(section('Output contract', outputTemplate.trim()).trimEnd());

  return `${parts.filter(Boolean).join('\n\n')}\n`;
}

function defaultPrompt({ step, input }) {
  const lines = [`# ${step.name}`];
  if (input?.role) lines.push('', `Role: ${input.role}`);
  return `${lines.join('\n')}\n`;
}

export function renderWorkflowPrompt({ workflowPath, workflow, baton, stepId, step, repositoryRoot, templateBaseDir } = {}) {
  const root = normalizeRepositoryRoot(repositoryRoot ?? path.resolve(path.dirname(path.resolve(workflowPath)), '..'));
  const input = step.input ?? {};
  const projection = projectState({ batonState: baton.state ?? {}, selectors: input.state ?? [], stepId });
  const stateBlock = fencedJson(projection.value);
  const inputTemplate = readInputTemplate({ workflowPath, workflow, input, repositoryRoot: root, templateBaseDir });
  const outputTemplate = readOutputTemplate({ workflow, step, repositoryRoot: root });

  const values = {
    'step.id': stepId,
    'step.name': step.name,
    'step.kind': step.kind,
    'input.prompt': input.prompt ?? '',
    'input.role': input.role ?? '',
    state: stateBlock,
    'output.template': outputTemplate.content,
  };

  const baseTemplate = inputTemplate.content ?? defaultPrompt({ step, input });
  const replaced = replacePlaceholders(baseTemplate, values);
  assertNoUnresolvedPlaceholders(replaced);
  const prompt = appendMissingSections({
    prompt: replaced,
    inlinePrompt: input.prompt ?? '',
    stateBlock,
    outputTemplate: outputTemplate.content,
    inputTemplateContent: inputTemplate.content,
  });

  return {
    stepId,
    action: actionForStep(step),
    kind: step.kind,
    name: step.name,
    role: input.role,
    prompt,
    metadata: {
      inputTemplate: input.template,
      outputTemplate: step.output?.template,
      projectedStateKeys: projection.projectedKeys,
    },
    diagnostics: [],
  };
}
