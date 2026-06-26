import runnerHostResponseSchema from './runner-host-response.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { workflowSchema } from '../../../file-contracts/workflow-document-schema.mjs';
import { assertJsonSchema } from '../../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export { runnerHostResponseSchema };

export function assertRunnerHostResponseSchema(response) {
  assertJsonSchema(runnerHostResponseSchema, response, 'workflow runner host response', { schemas: [runnerHostResponseSchema, batonSchema, workflowSchema] });
}
