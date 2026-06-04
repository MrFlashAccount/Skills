import { parsePathExpression } from '../../../runtime/expression.mjs';
import { readPath } from './path.mjs';

export function evaluatePathExpression(source, context) {
  const expression = parsePathExpression(source);
  return readPath(context, expression);
}
