import { readFile } from 'node:fs/promises';

function assertNonEmptyUserPrompt(value, source) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${source} must not be empty or whitespace-only`);
  }
  return value;
}

function assertNonEmptyUserPromptFilePath(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('--user-prompt-file path must not be empty or whitespace-only');
  }
  return value;
}

export async function resolveStartupUserPrompt({ userPrompt, userPromptFile } = {}) {
  if (userPrompt !== undefined && userPromptFile !== undefined) throw new Error('provide only one of --user-prompt or --user-prompt-file');
  if (userPrompt !== undefined) return assertNonEmptyUserPrompt(userPrompt, '--user-prompt');
  if (userPromptFile !== undefined) return assertNonEmptyUserPrompt(await readFile(assertNonEmptyUserPromptFilePath(userPromptFile), 'utf8'), '--user-prompt-file');
  return undefined;
}

export function hasAnyWorkerOutput({ workflow, baton }) {
  const state = baton?.state ?? {};
  return Object.entries(workflow?.steps ?? {}).some(([stepId, step]) => step?.kind === 'worker' && Object.hasOwn(state, stepId));
}

function canSelectStartupUserPrompt({ workflow, baton }) {
  if (typeof baton?.user_prompt !== 'string' || baton.user_prompt.trim().length === 0) return false;
  if (baton.user_prompt_injected === true) return false;
  if (hasAnyWorkerOutput({ workflow, baton })) return false;
  return true;
}

export function selectedUserPromptStepId({ workflow, baton }) {
  if (!canSelectStartupUserPrompt({ workflow, baton })) return undefined;
  return typeof baton.user_prompt_target === 'string' ? baton.user_prompt_target : undefined;
}

export function withSelectedStartupUserPromptTarget({ workflow, baton, steps }) {
  if (!canSelectStartupUserPrompt({ workflow, baton })) return baton;
  if (typeof baton.user_prompt_target === 'string') return baton;
  const target = steps.find((entry) => entry.step?.kind === 'worker')?.id;
  if (!target) return baton;
  return { ...baton, user_prompt_target: target };
}

export function shouldMarkUserPromptInjectedForStep({ workflow, baton, stepId }) {
  return selectedUserPromptStepId({ workflow, baton }) === stepId;
}

export function markUserPromptInjectedForStep({ workflow, baton, stepId }) {
  if (!shouldMarkUserPromptInjectedForStep({ workflow, baton, stepId })) return baton;
  return { ...baton, user_prompt_injected: true };
}
