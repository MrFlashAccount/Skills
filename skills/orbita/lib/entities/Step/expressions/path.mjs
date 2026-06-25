import { WorkflowRuntimeError } from '../../../errors.mjs';

function formatPath(root, path) {
  return [root, ...path].join('.');
}

export function readPath(context, expression) {
  const rootValue = context?.[expression.root];
  let current = rootValue;

  for (let index = 0; index < expression.path.length; index += 1) {
    const segment = expression.path[index];
    const currentPath = formatPath(expression.root, expression.path.slice(0, index + 1));
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      throw new WorkflowRuntimeError(`workflow expression '${expression.source}' could not resolve missing path '${currentPath}'`);
    }
    current = current[segment];
  }

  return current;
}
