import workerOutputSchema from './schema/worker-output.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { assertSchema } from '../../../schema-kernel/index.mjs';

export { workerOutputSchema };

export function assertWorkerOutputSchema(workerOutput) {
  assertSchema(workerOutputSchema, workerOutput, 'worker output', { schemas: [workerOutputSchema, batonSchema] });
}
