import { WorkflowInterpreterError } from './errors.mjs';

const TOP_LEVEL_SELECTOR = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function assertValidSelector(selector, stepId) {
  if (typeof selector !== 'string' || !TOP_LEVEL_SELECTOR.test(selector)) {
    throw new WorkflowInterpreterError(
      `workflow prompt render failed: step '${stepId}' uses unsupported state selector '${selector}'; v1 supports top-level workflow step ids only`,
    );
  }
}

export function projectState({ batonState = {}, selectors = [], stepId = '' } = {}) {
  const value = {};
  const projectedKeys = [];
  const diagnostics = [];

  for (const selector of selectors ?? []) {
    assertValidSelector(selector, stepId);

    if (!Object.hasOwn(batonState, selector)) continue;

    value[selector] = structuredClone(batonState[selector]);
    projectedKeys.push(selector);
  }

  return { value, projectedKeys, diagnostics };
}

export function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}
