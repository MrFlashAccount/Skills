import Ajv2020 from './vendor/ajv.mjs';

/**
 * Validate a value against a JSON Schema with optional referenced schemas.
 *
 * The schema documents remain the source of truth; callers pass the schema
 * object they want checked at runtime instead of importing generated validators.
 */
function createAjv() {
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addKeyword({ keyword: 'x-usage' });
  return ajv;
}

export class SchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

export function formatSchemaErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message}`.trim())
    .join('; ');
}

export function validateJsonSchema(schema, value, options = {}) {
  const ajv = createAjv();
  const loadedSchemaIds = new Set();

  for (const referencedSchema of options.schemas ?? []) {
    const schemaId = referencedSchema?.$id;
    if (schemaId && loadedSchemaIds.has(schemaId)) continue;
    ajv.addSchema(referencedSchema);
    if (schemaId) loadedSchemaIds.add(schemaId);
  }

  const validate = schema?.$id ? (ajv.getSchema(schema.$id) ?? ajv.compile(schema)) : ajv.compile(schema);
  const ok = validate(value);
  return {
    ok,
    errors: validate.errors ?? [],
  };
}

export function compileJsonSchema(schema, { schemas = [] } = {}) {
  return validateJsonSchema(schema, {}, { schemas });
}

export function assertJsonSchema(schema, value, name, { schemas = [] } = {}) {
  const validation = validateJsonSchema(schema, value, { schemas });
  if (!validation.ok) throw new SchemaValidationError(`${name} failed schema validation: ${formatSchemaErrors(validation.errors)}`);
}
