import { readFile } from 'node:fs/promises';

export async function resolveStartupUserPrompt({ userPrompt, userPromptFile } = {}) {
  if (userPrompt !== undefined && userPromptFile) throw new Error('provide only one of --user-prompt or --user-prompt-file');
  if (userPrompt !== undefined) return userPrompt;
  if (userPromptFile) return readFile(userPromptFile, 'utf8');
  return undefined;
}

export function hasAnyWorkerOutput({ workflow, baton }) {
  const state = baton?.state ?? {};
  return Object.entries(workflow?.steps ?? {}).some(([stepId, step]) => step?.kind === 'worker' && Object.hasOwn(state, stepId));
}

export function initialUserPromptStepId({ workflow, baton, steps }) {
  if (typeof baton?.user_prompt !== 'string') return undefined;
  if (hasAnyWorkerOutput({ workflow, baton })) return undefined;
  return steps.find((entry) => entry.step?.kind === 'worker')?.id;
}
