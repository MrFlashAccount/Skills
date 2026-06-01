import { compileSchema } from '../../schema-kernel/index.mjs';

export function compileWorkflowOutputSchema(schema, { externalSchemas = [] } = {}) {
  return compileSchema(schema, { schemas: externalSchemas });
}
