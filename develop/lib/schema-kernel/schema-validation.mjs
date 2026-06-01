import { validateJsonSchema } from 'schema-validation';
import { SchemaValidationError } from './schema-error.mjs';

export function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

export function validateSchema(schema, value, { schemas = [] } = {}) {
  return validateJsonSchema(schema, value, { schemas });
}

export function compileSchema(schema, { schemas = [] } = {}) {
  return validateSchema(schema, {}, { schemas });
}

export function assertSchema(schema, value, name, { schemas = [] } = {}) {
  const validation = validateSchema(schema, value, { schemas });
  if (!validation.ok) throw new SchemaValidationError(`${name} failed schema validation: ${formatSchemaErrors(validation.errors)}`);
}

export { validateJsonSchema };
