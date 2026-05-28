import Ajv2020 from 'ajv/dist/2020.js';

/**
 * Validate a value against a JSON Schema with optional referenced schemas.
 *
 * The schema documents remain the source of truth; callers pass the schema
 * object they want checked at runtime instead of importing generated validators.
 */
export function validateJsonSchema(schema, value, options = {}) {
  const ajv = new Ajv2020({ allErrors: true });
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
