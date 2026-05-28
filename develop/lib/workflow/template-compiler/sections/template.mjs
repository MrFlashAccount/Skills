import path from 'node:path';
import { WorkflowInterpreterError } from '../../errors.mjs';
import { safeReadTemplate, workflowSkillBase } from '../utils.mjs';

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
