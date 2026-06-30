import { assertProjectableStateSelector } from './state-keys.mjs';

export function selectState({ batonState = {}, selectors = [], stepId = '' } = {}) {
  const value = {};
  const selectedKeys = [];
  const diagnostics = [];

  for (const selector of selectors ?? []) {
    assertProjectableStateSelector(selector, { stepId });

    if (!Object.hasOwn(batonState, selector)) continue;

    value[selector] = structuredClone(batonState[selector]);
    selectedKeys.push(selector);
  }

  return { value, selectedKeys, diagnostics };
}

export function fencedJson(value) {
  return `\`\`\`json
${JSON.stringify(value, null, 2)}
\`\`\`
`;
}
