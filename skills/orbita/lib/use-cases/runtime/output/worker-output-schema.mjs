import workerOutputSchema from './schema/worker-output.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { assertJsonSchema } from '../../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export { workerOutputSchema };

export function assertWorkerOutputSchema(workerOutput) {
  assertJsonSchema(workerOutputSchema, workerOutput, 'worker output', { schemas: [workerOutputSchema, batonSchema] });
}
