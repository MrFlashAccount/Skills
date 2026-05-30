import path from 'node:path';
import { WorkflowInterpreterError } from '../../errors.mjs';
import { safeReadTemplate } from '../utils.mjs';

export function readInputTemplate({ workflowPath, workflow, input, repositoryRoot, templateBaseDir }) {
  if (!input?.template) return { content: undefined, metadataPath: undefined };
  const workflowDir = path.dirname(path.resolve(workflowPath));
  if (templateBaseDir && path.resolve(templateBaseDir) !== workflowDir) {
    throw new WorkflowInterpreterError(`workflow prompt render failed: input template escapes repository root: ${input.template}`);
  }
  const bases = [path.resolve(workflowDir)];
  const allowedRoots = [path.resolve(workflowDir)];
  const resolved = safeReadTemplate({
    templateRef: input.template,
    fieldName: 'input',
    bases,
    repositoryRoot,
    allowedRoots,
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
