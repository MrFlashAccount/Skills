import { WorkflowRuntimeError } from '../../errors.mjs';
import { templateResource } from '../utils.mjs';

export function readInputTemplate({ input, resources }) {
  if (!input?.template) return { content: undefined, metadataPath: undefined };
  const resolved = templateResource(resources, input.template, 'input');
  return { content: resolved.content, metadataPath: input.template };
}

export function defaultPrompt({ step }) {
  return `# ${step.name}\n`;
}

export function assertNoUnsupportedPlaceholders(promptLayer, templatePath) {
  const unsupported = promptLayer.match(/{{\s*[^{}]+?\s*}}/g);
  if (unsupported) {
    const source = templatePath ? ` in input template '${templatePath}'` : '';
    throw new WorkflowRuntimeError(`workflow prompt render failed: placeholders are unsupported${source}: ${unsupported[0]}`);
  }
}
