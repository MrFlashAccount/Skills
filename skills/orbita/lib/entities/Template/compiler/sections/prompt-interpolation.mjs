import { WorkflowRuntimeError } from '../../../../errors.mjs';
import { parsePathExpression } from '../../../../runtime/expression.mjs';
import { fencedJson } from '../../../../runtime/state-projection.mjs';

const TOKEN_PATTERN = /\$\{\{[\s\S]*?\}\}/g;
const TOKEN_INNER_PATTERN = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/;
const PATH_WITH_DEFAULT_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)(?:\s*\|\s*default\s*:\s*([\s\S]+))?$/;

function promptInterpolationError(source, reason) {
  return new WorkflowRuntimeError(`workflow prompt render failed: prompt expression '${source}' is invalid: ${reason}`);
}

function parseDefaultLiteral(source, literal) {
  try {
    return JSON.parse(literal);
  } catch {
    throw promptInterpolationError(source, 'default must be a JSON literal');
  }
}

function parsePromptInterpolation(source) {
  const inner = source.match(TOKEN_INNER_PATTERN)?.[1]?.trim();
  const match = inner?.match(PATH_WITH_DEFAULT_PATTERN);
  if (!match) {
    throw promptInterpolationError(source, 'v1 supports only a path expression with optional `| default: <json-literal>`');
  }

  const [, pathSource, defaultLiteral] = match;
  const expression = parsePathExpression(`\${{ ${pathSource} }}`);
  if (expression.root !== 'input') {
    throw promptInterpolationError(source, "root 'input' is required in input.prompt interpolation");
  }

  return {
    expression: { ...expression, source },
    hasDefault: defaultLiteral !== undefined,
    defaultValue: defaultLiteral === undefined ? undefined : parseDefaultLiteral(source, defaultLiteral.trim()),
  };
}

function missingPathMessage(expression, path) {
  return `prompt expression '${expression.source}' could not resolve missing path '${path}'`;
}

function readValueAtPath(context, expression) {
  let current = context?.[expression.root];

  for (let index = 0; index < expression.path.length; index += 1) {
    const segment = expression.path[index];
    const currentPath = [expression.root, ...expression.path.slice(0, index + 1)].join('.');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return { ok: false, missingPath: currentPath };
    }
    current = current[segment];
  }

  if (current === undefined) return { ok: false, missingPath: [expression.root, ...expression.path].join('.') };
  return { ok: true, value: current };
}

function renderPromptValue(value) {
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fencedJson(value).trimEnd();
}

export function interpolatePromptExpressions(prompt, inputContext = {}) {
  if (typeof prompt !== 'string' || !prompt.includes('${{')) return prompt;

  if (prompt.replace(TOKEN_PATTERN, '').includes('${{')) {
    throw new WorkflowRuntimeError('workflow prompt render failed: malformed prompt interpolation');
  }

  return prompt.replace(TOKEN_PATTERN, (source) => {
    const interpolation = parsePromptInterpolation(source);
    const result = readValueAtPath(inputContext, interpolation.expression);
    if (!result.ok) {
      if (interpolation.hasDefault) return renderPromptValue(interpolation.defaultValue);
      throw new WorkflowRuntimeError(`workflow prompt render failed: ${missingPathMessage(interpolation.expression, result.missingPath)}`);
    }
    return renderPromptValue(result.value);
  });
}
