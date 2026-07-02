import workflowRuntimeResponseSchema from './schema/workflow-runtime-response.json' with { type: 'json' };
import { batonSchema } from '../../../entities/Baton/schema/baton-schema.mjs';
import { workflowSchema } from '../../../file-contracts/workflow-document-schema.mjs';
import { assertJsonSchema } from '../../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export { workflowRuntimeResponseSchema };

export function assertResponseSchema(response) {
  assertJsonSchema(workflowRuntimeResponseSchema, response, 'workflow runtime response', { schemas: [workflowRuntimeResponseSchema, batonSchema, workflowSchema] });
}
