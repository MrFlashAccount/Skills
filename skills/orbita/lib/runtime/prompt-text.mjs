import { WorkflowRuntimeError } from '../errors.mjs';

export function normalizePromptText(value, { fieldName = 'input.prompt' } = {}) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join('\n');

  throw new WorkflowRuntimeError(`workflow prompt render failed: ${fieldName} must be a string or an array of strings`);
}

export function appendPromptText(value, suffix, { separator = '\n\n', fieldName = 'input.prompt' } = {}) {
  const prompt = normalizePromptText(value, { fieldName });
  return [prompt, suffix].filter((item) => typeof item === 'string' && item.length > 0).join(separator);
}
