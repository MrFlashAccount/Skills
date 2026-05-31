import { loadOutputSchema, resolveOutputSchemaPath } from './output-schema.mjs';
import { validateAgainstOutputSchema as validateLoadedOutputSchema } from '../schemas/output-schema-validation.mjs';

export { resolveOutputSchemaPath };
export {
  OUTPUT_SCHEMA_MAX_ATTEMPTS,
  outputSchemaRetryKey,
  validationRetryPrompt,
} from '../schemas/output-schema-validation.mjs';

export function readOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot }) {
  return loadOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot }).schema;
}

export const validateAgainstOutputSchema = (options) => validateLoadedOutputSchema({
  ...options,
  schema: options.schema ?? readOutputSchema(options),
});
