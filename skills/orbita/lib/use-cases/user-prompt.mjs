import { normalizeTransitionNext } from '../runtime/transition-next.mjs';

function assertNonEmptyUserPrompt(value, source) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${source} must not be empty or whitespace-only`);
  }
  return value;
}

export function resolveStartupUserPrompt({ userPrompt, userPromptFileContent } = {}) {
  if (userPrompt !== undefined && userPromptFileContent !== undefined) throw new Error('provide only one of --user-prompt or --user-prompt-file');
  if (userPrompt !== undefined) return assertNonEmptyUserPrompt(userPrompt, '--user-prompt');
  if (userPromptFileContent !== undefined) return assertNonEmptyUserPrompt(userPromptFileContent, '--user-prompt-file');
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

function uniqueWorkerTargets(targets) {
  return [...new Set(targets)];
}

function firstRenderableStaticParallelWorkerTarget({ workflow, stepId, targets }) {
  const workerTargets = [];
  for (const target of targets) {
    const targetStep = workflow?.steps?.[target];
    if (!targetStep) throw new Error(`cannot determine stable startup user prompt target: transition target not found in workflow: ${target}`);
    if (targetStep.kind === 'worker') workerTargets.push(target);
  }
  if (workerTargets.length > 0) return workerTargets[0];
  throw new Error(`cannot determine stable startup user prompt target: workflow step '${stepId}' static parallel next has no worker target renderable in the first fanout response`);
}

function firstStaticWorkerTargetForParallelCase({ workflow, stepId, targets }) {
  return firstRenderableStaticParallelWorkerTarget({ workflow, stepId, targets });
}

function firstStaticWorkerTarget({ workflow, stepId, visited = new Set() }) {
  if (visited.has(stepId)) throw new Error(`cannot determine stable startup user prompt target: static transition cycle includes '${stepId}'`);
  visited.add(stepId);

  const step = workflow?.steps?.[stepId];
  if (!step) throw new Error(`cannot determine stable startup user prompt target: transition target not found in workflow: ${stepId}`);
  if (step.kind === 'worker') return stepId;
  if (step.kind === 'done' || step.kind === 'blocked') return undefined;
  if (step.next === undefined) return undefined;

  const descriptor = normalizeTransitionNext(step.next);
  if (descriptor.kind === 'static-target') return firstStaticWorkerTarget({ workflow, stepId: descriptor.target, visited });
  if (descriptor.kind === 'static-parallel') return firstRenderableStaticParallelWorkerTarget({ workflow, stepId, targets: descriptor.targets });
  if (descriptor.kind === 'match-cases') {
    const targets = [];
    for (const target of Object.values(descriptor.cases)) {
      const workerTarget = typeof target === 'string'
        ? firstStaticWorkerTarget({ workflow, stepId: target, visited: new Set(visited) })
        : firstStaticWorkerTargetForParallelCase({ workflow, stepId, targets: target });
      if (!workerTarget) throw new Error(`cannot determine stable startup user prompt target: workflow step '${stepId}' has a match/cases branch with no worker target`);
      targets.push(workerTarget);
    }
    const uniqueTargets = uniqueWorkerTargets(targets);
    if (uniqueTargets.length === 1) return uniqueTargets[0];
  }

  throw new Error(`cannot determine stable startup user prompt target: workflow step '${stepId}' uses dynamic or ambiguous next`);
}

// Computes the worker that owns a startup prompt from the initial workflow topology,
// before any approval/control output can be affected by later workflow drift.
export function startupUserPromptTarget({ workflow, start }) {
  const target = firstStaticWorkerTarget({ workflow, stepId: start });
  if (!target) throw new Error('cannot determine stable startup user prompt target: no worker step is reachable from workflow.start through static next');
  return target;
}

function renderedWorkerStepIds(steps) {
  return steps.filter((entry) => entry.step?.kind === 'worker').map((entry) => entry.id);
}

// A saved startup prompt target is authoritative: when workers are about to render,
// the target must be one of them so the prompt cannot disappear silently.
export function assertStartupUserPromptTargetRenderable({ workflow, baton, steps }) {
  if (!canSelectStartupUserPrompt({ workflow, baton })) return;

  const workerStepIds = renderedWorkerStepIds(steps);
  const target = baton.user_prompt_target;
  if (typeof target !== 'string' || target.length === 0) {
    if (workerStepIds.length > 0) throw new Error('startup user prompt target is not set; refusing to choose a drift-prone worker target');
    return;
  }

  const targetStep = workflow?.steps?.[target];
  if (!targetStep) throw new Error(`startup user prompt target '${target}' is no longer defined in the workflow`);
  if (targetStep.kind !== 'worker') throw new Error(`startup user prompt target '${target}' is not a worker step`);
  const terminalStepIds = steps.filter((entry) => entry.step?.kind === 'done' || entry.step?.kind === 'blocked').map((entry) => entry.id);
  if ((workerStepIds.length > 0 || terminalStepIds.length > 0) && !workerStepIds.includes(target)) {
    throw new Error(`startup user prompt target '${target}' is not renderable in the current workflow response; refusing to drop the startup user prompt`);
  }
}

export function selectedUserPromptStepId({ workflow, baton }) {
  if (!canSelectStartupUserPrompt({ workflow, baton })) return undefined;
  return typeof baton.user_prompt_target === 'string' ? baton.user_prompt_target : undefined;
}

export function validateSelectedStartupUserPromptTarget({ workflow, baton, steps }) {
  assertStartupUserPromptTargetRenderable({ workflow, baton, steps });
  return baton;
}

export function shouldMarkUserPromptInjectedForStep({ workflow, baton, stepId }) {
  return selectedUserPromptStepId({ workflow, baton }) === stepId;
}

export function markUserPromptInjectedForStep({ workflow, baton, stepId }) {
  if (!shouldMarkUserPromptInjectedForStep({ workflow, baton, stepId })) return baton;
  return { ...baton, user_prompt_injected: true };
}
