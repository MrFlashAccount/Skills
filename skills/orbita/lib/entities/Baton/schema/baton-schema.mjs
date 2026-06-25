import batonSchema from './baton.json' with { type: 'json' };
import { assertJsonSchema } from 'schema-validation';

export { batonSchema };

export function assertBatonSchema(baton) {
  assertJsonSchema(batonSchema, baton, 'baton', { schemas: [batonSchema] });
}
