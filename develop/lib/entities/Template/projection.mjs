import { assertProjectableStateSelector } from '../Baton/state-keys.mjs';

export function projectState({ batonState = {}, selectors = [], stepId = '' } = {}) {
  const value = {};
  const projectedKeys = [];
  const diagnostics = [];

  for (const selector of selectors ?? []) {
    assertProjectableStateSelector(selector, { stepId });

    if (!Object.hasOwn(batonState, selector)) continue;

    value[selector] = structuredClone(batonState[selector]);
    projectedKeys.push(selector);
  }

  return { value, projectedKeys, diagnostics };
}

export function fencedJson(value) {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}
