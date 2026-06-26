import runsIndexSchema from './runs-index.json' with { type: 'json' };
import { assertJsonSchema } from '../../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export { runsIndexSchema };

export function assertRunsIndexSchema(index) {
  assertJsonSchema(runsIndexSchema, index, 'runs index', { schemas: [runsIndexSchema] });
}
