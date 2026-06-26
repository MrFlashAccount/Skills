import batonSchema from './baton.json' with { type: 'json' };
import { assertJsonSchema } from '../../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export { batonSchema };

export function assertBatonSchema(baton) {
  assertJsonSchema(batonSchema, baton, 'baton', { schemas: [batonSchema] });
}
