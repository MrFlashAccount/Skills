import runnerHostResponseSchema from './runner-host-response.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { workflowSchema } from '../../../file-contracts/workflow-document-schema.mjs';
import { assertSchema } from '../../../schema-kernel/index.mjs';

export { runnerHostResponseSchema };

export function assertRunnerHostResponseSchema(response) {
  assertSchema(runnerHostResponseSchema, response, 'workflow runner host response', { schemas: [runnerHostResponseSchema, batonSchema, workflowSchema] });
}
