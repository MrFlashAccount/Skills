import workflowInterpreterResponseSchema from './schema/workflow-interpreter-response.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { workflowSchema } from '../../../file-contracts/workflow-document-schema.mjs';
import { assertJsonSchema } from '../../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export { workflowInterpreterResponseSchema };

export function assertResponseSchema(response) {
  assertJsonSchema(workflowInterpreterResponseSchema, response, 'workflow interpreter response', { schemas: [workflowInterpreterResponseSchema, batonSchema, workflowSchema] });
}
