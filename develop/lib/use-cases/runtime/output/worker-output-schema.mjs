import workerOutputSchema from './schema/worker-output.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { assertJsonSchema } from 'schema-validation';

export { workerOutputSchema };

export function assertWorkerOutputSchema(workerOutput) {
  assertJsonSchema(workerOutputSchema, workerOutput, 'worker output', { schemas: [workerOutputSchema, batonSchema] });
}
