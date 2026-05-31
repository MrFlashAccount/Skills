import { WorkflowInterpreterError } from './errors.mjs';

export const RESERVED_STATE_KEYS = Object.freeze(['artifacts', 'results', 'outputs', 'attempts']);
export const DANGEROUS_OBJECT_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);
export const RESERVED_STEP_IDS = [...RESERVED_STATE_KEYS, ...DANGEROUS_OBJECT_KEYS];
export const TOP_LEVEL_STATE_SELECTOR = /^[A-Za-z_][A-Za-z0-9_-]*$/;

export function isReservedStateKey(value) {
  return RESERVED_STATE_KEYS.includes(value);
}

export function isDangerousObjectKey(value) {
  return DANGEROUS_OBJECT_KEYS.includes(value);
}

export function isTopLevelStateSelector(value) {
  return typeof value === 'string' && TOP_LEVEL_STATE_SELECTOR.test(value);
}

export function assertProjectableStateSelector(selector, { stepId = '', errorPrefix = 'workflow prompt render failed' } = {}) {
  if (!isTopLevelStateSelector(selector)) {
    throw new WorkflowInterpreterError(
      `${errorPrefix}: step '${stepId}' uses unsupported state selector '${selector}'; v1 supports top-level workflow step ids only`,
    );
  }

  if (isReservedStateKey(selector)) {
    throw new WorkflowInterpreterError(
      `${errorPrefix}: step '${stepId}' uses reserved state selector '${selector}'; selector is reserved for runtime aggregate state and cannot be projected`,
    );
  }

  if (isDangerousObjectKey(selector)) {
    throw new WorkflowInterpreterError(
      `${errorPrefix}: step '${stepId}' uses unsafe state selector '${selector}'; selector is reserved because it is unsafe as a JavaScript object key`,
    );
  }
}
