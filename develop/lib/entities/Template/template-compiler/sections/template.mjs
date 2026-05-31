import { WorkflowInterpreterError } from '../../../Workflow/errors.mjs';
import { safeReadTemplate } from '../utils.mjs';

export function readInputTemplate({ workflowPath, workflow, input, repositoryRoot, templateBaseDir }) {
  if (!input?.template) return { content: undefined, metadataPath: undefined };
  const resolved = safeReadTemplate({
    workflowPath,
    templateRef: input.template,
    fieldName: 'input',
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
