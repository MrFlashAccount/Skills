import batonSchema from './baton.json' with { type: 'json' };
import { assertSchema, SchemaValidationError } from '../../../schema-kernel/index.mjs';

export { batonSchema };

export function assertBatonSchema(baton) {
  try {
    assertSchema(batonSchema, baton, 'baton', { schemas: [batonSchema] });
  } catch (error) {
    if (error instanceof SchemaValidationError) throw error;
    throw error;
  }
}
