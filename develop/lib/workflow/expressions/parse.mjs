import { WorkflowInterpreterError } from '../errors.mjs';

const EXPRESSION_PATTERN = /^\$\{\{\s*([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)\s*\}\}$/;
const SEGMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const ALLOWED_ROOTS = new Set(['output', 'input']);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function expressionError(source, reason) {
  return new WorkflowInterpreterError(`workflow expression '${source}' is invalid: ${reason}`);
}

export function isExpressionString(value) {
  return typeof value === 'string' && value.includes('${{');
}

export function parsePathExpression(source) {
  if (typeof source !== 'string') throw new WorkflowInterpreterError('workflow expression source must be a string');

  const match = source.match(EXPRESSION_PATTERN);
  if (!match) {
    throw expressionError(
      source,
      'v1 supports only a whole-string path expression like ${{ output.next }} or ${{ input.planning_draft.selected_reviewers }}',
    );
  }

  const segments = match[1].split('.');
  const [root, ...path] = segments;
  if (!ALLOWED_ROOTS.has(root)) throw expressionError(source, `root '${root}' is not allowed; use output or input`);
  if (path.length === 0) throw expressionError(source, 'path must include at least one field after the root');

  for (const segment of path) {
    if (!SEGMENT_PATTERN.test(segment)) throw expressionError(source, `path segment '${segment}' is not supported`);
    if (DANGEROUS_KEYS.has(segment)) throw expressionError(source, `path segment '${segment}' is not allowed`);
  }

  return { source, root, path: Object.freeze(path), segments: Object.freeze(segments) };
}
