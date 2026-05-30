import { WorkflowInterpreterError } from './errors.mjs';

const TOP_LEVEL_SELECTOR = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function formatAvailableKeys(batonState = {}) {
  const keys = Object.keys(batonState);
  return keys.length > 0 ? keys.join(', ') : '(none)';
}

function assertValidSelector(selector, stepId) {
  if (typeof selector !== 'string' || !TOP_LEVEL_SELECTOR.test(selector)) {
    throw new WorkflowInterpreterError(
      `workflow prompt render failed: step '${stepId}' uses unsupported state selector '${selector}'; v1 supports top-level baton state keys only`,
    );
  }
}

export function projectState({ batonState = {}, selectors = [], optionalSelectors = [], stepId = '' } = {}) {
  const value = {};
  const projectedKeys = [];
  const diagnostics = [];

  for (const selector of selectors ?? []) {
    assertValidSelector(selector, stepId);

    if (!Object.hasOwn(batonState, selector)) {
      throw new WorkflowInterpreterError(
        `workflow prompt render failed: step '${stepId}' selected missing baton state key '${selector}'; available keys: ${formatAvailableKeys(batonState)}`,
      );
    }

    value[selector] = structuredClone(batonState[selector]);
    projectedKeys.push(selector);
  }

  for (const selector of optionalSelectors ?? []) {
    assertValidSelector(selector, stepId);
    if (!Object.hasOwn(batonState, selector)) {
      diagnostics.push({ severity: 'info', code: 'optional_state_missing', selector });
      continue;
    }
    if (Object.hasOwn(value, selector)) continue;
    value[selector] = structuredClone(batonState[selector]);
    projectedKeys.push(selector);
  }

  return { value, projectedKeys, diagnostics };
}

export function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}
