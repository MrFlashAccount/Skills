import { readFile } from 'node:fs/promises';

function assertNonEmptyUserPrompt(value, source) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${source} must not be empty or whitespace-only`);
  }
  return value;
}

export async function resolveStartupUserPrompt({ userPrompt, userPromptFile } = {}) {
  if (userPrompt !== undefined && userPromptFile !== undefined) throw new Error('provide only one of --user-prompt or --user-prompt-file');
  if (userPrompt !== undefined) return assertNonEmptyUserPrompt(userPrompt, '--user-prompt');
  if (userPromptFile !== undefined) return assertNonEmptyUserPrompt(await readFile(userPromptFile, 'utf8'), '--user-prompt-file');
  return undefined;
}

export function hasAnyWorkerOutput({ workflow, baton }) {
  const state = baton?.state ?? {};
  return Object.entries(workflow?.steps ?? {}).some(([stepId, step]) => step?.kind === 'worker' && Object.hasOwn(state, stepId));
}

export function initialUserPromptStepId({ workflow, baton, steps }) {
  if (typeof baton?.user_prompt !== 'string' || baton.user_prompt.trim().length === 0) return undefined;
  if (hasAnyWorkerOutput({ workflow, baton })) return undefined;
  return steps.find((entry) => entry.step?.kind === 'worker')?.id;
}
