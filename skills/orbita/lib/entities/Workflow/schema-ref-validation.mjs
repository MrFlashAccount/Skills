import { compileJsonSchema } from '../../../../../shared/scripts/schema-validation/schema-validation.mjs';

export function compileWorkflowOutputSchema(schema, { externalSchemas = [] } = {}) {
  return compileJsonSchema(schema, { schemas: externalSchemas });
}
