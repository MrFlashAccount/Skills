import { compileJsonSchema } from 'schema-validation';

export function compileWorkflowOutputSchema(schema, { externalSchemas = [] } = {}) {
  return compileJsonSchema(schema, { schemas: externalSchemas });
}
