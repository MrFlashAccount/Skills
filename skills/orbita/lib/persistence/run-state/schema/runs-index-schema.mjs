import runsIndexSchema from './runs-index.json' with { type: 'json' };
import { assertJsonSchema } from 'schema-validation';

export { runsIndexSchema };

export function assertRunsIndexSchema(index) {
  assertJsonSchema(runsIndexSchema, index, 'runs index', { schemas: [runsIndexSchema] });
}
