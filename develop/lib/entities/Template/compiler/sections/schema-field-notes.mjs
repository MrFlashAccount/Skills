const NOTE_KEYS = Object.freeze({
  write: ['x-usage'],
  read: ['x-usage'],
});

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function stringNote(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function decodeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveLocalSchemaRef(rootSchema, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined;
  if (ref === '#') return rootSchema;
  if (!ref.startsWith('#/')) return undefined;

  let current = rootSchema;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = decodeJsonPointerSegment(rawSegment);
    if (!isObject(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function schemaDefinitionsList(schemaDefinitions) {
  if (schemaDefinitions instanceof Map) return Array.from(schemaDefinitions.values());
  if (Array.isArray(schemaDefinitions)) return schemaDefinitions;
  if (isObject(schemaDefinitions)) return Object.values(schemaDefinitions);
  return [];
}

function resolveExternalSchemaRef(schemaDefinitions, ref) {
  for (const schemaDefinition of schemaDefinitionsList(schemaDefinitions)) {
    if (!isObject(schemaDefinition) || typeof schemaDefinition.$id !== 'string') continue;
    if (ref === schemaDefinition.$id) return { schema: schemaDefinition, rootSchema: schemaDefinition };
    if (ref.startsWith(`${schemaDefinition.$id}#`)) {
      return {
        schema: resolveLocalSchemaRef(schemaDefinition, ref.slice(schemaDefinition.$id.length)),
        rootSchema: schemaDefinition,
      };
    }
  }
  return { schema: undefined, rootSchema: undefined };
}

function resolveSchemaRef(rootSchema, ref, schemaDefinitions) {
  if (typeof ref !== 'string') return { schema: undefined, rootSchema: undefined };
  if (ref.startsWith('#')) return { schema: resolveLocalSchemaRef(rootSchema, ref), rootSchema };
  return resolveExternalSchemaRef(schemaDefinitions, ref);
}

function unresolvedRefMessage(ref) {
  return `schema field notes failed: unresolved schema $ref '${ref}'`;
}

export function normalizeSchemaForNotes(schema, rootSchema = schema, refStack = [], options = {}) {
  if (!isObject(schema)) return schema;

  let baseSchema = {};
  if (typeof schema.$ref === 'string') {
    if (refStack.includes(schema.$ref)) return schema;
    const resolved = resolveSchemaRef(rootSchema, schema.$ref, options.schemaDefinitions);
    if (resolved.schema) baseSchema = normalizeSchemaForNotes(resolved.schema, resolved.rootSchema ?? rootSchema, [...refStack, schema.$ref], options);
    else if (options.failOnUnresolvedRefs) throw new Error(unresolvedRefMessage(schema.$ref));
  }

  const normalized = { ...baseSchema };
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref') continue;
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) => normalizeSchemaForNotes(item, rootSchema, refStack, options));
    } else if (isObject(value)) {
      normalized[key] = normalizeSchemaForNotes(value, rootSchema, refStack, options);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function usageForMode(schema, mode) {
  for (const key of NOTE_KEYS[mode] ?? NOTE_KEYS.read) {
    const note = stringNote(schema?.[key]);
    if (note) return note;
  }
  return '';
}

function addNoteLines(lines, path, schema, { mode, usageLabel }) {
  const description = stringNote(schema.description);
  const usage = usageForMode(schema, mode);
  if (!description && !usage) return;
  lines.push(`- ${path}`);
  if (description) lines.push(`  - Description: ${description}`);
  if (usage) lines.push(`  - ${usageLabel}: ${usage}`);
}

function collectPropertyNotes(lines, schema, rootSchema, path, options, depth = 0) {
  if (!isObject(schema) || depth > 6) return;
  const normalized = normalizeSchemaForNotes(schema, rootSchema, [], options);
  addNoteLines(lines, path, normalized, options);

  if (normalized.type === 'array' || normalized.items) {
    collectPropertyNotes(lines, normalized.items, rootSchema, `${path}[]`, options, depth + 1);
    return;
  }

  if (normalized.properties && typeof normalized.properties === 'object') {
    for (const [propertyName, propertySchema] of Object.entries(normalized.properties)) {
      collectPropertyNotes(lines, propertySchema, rootSchema, path ? `${path}.${propertyName}` : propertyName, options, depth + 1);
    }
  }
}

export function artifactOutputFieldNotes(schema, options = {}) {
  const normalized = normalizeSchemaForNotes(schema, schema, [], { ...options, failOnUnresolvedRefs: true });
  const artifactsSchema = normalized?.properties?.artifacts;
  if (!artifactsSchema) return '';
  const lines = [];
  collectPropertyNotes(lines, artifactsSchema, normalized, 'artifacts', { mode: 'write', usageLabel: 'Fill' });
  if (lines.length === 0) return '';
  return [
    'Schema-derived artifact field notes. These notes are generated from output.schema description/x-usage metadata; the JSON schema remains authoritative.',
    '',
    ...lines,
  ].join('\n');
}

export function projectedValueFieldNotes({ stepId, schema, value, schemaDefinitions }) {
  if (!isObject(schema) || !isObject(value)) return [];
  const normalized = normalizeSchemaForNotes(schema, schema, [], { schemaDefinitions, failOnUnresolvedRefs: true });
  const lines = [];
  for (const [fieldName, fieldSchema] of Object.entries(normalized.properties ?? {})) {
    if (!Object.hasOwn(value, fieldName) || !isObject(fieldSchema)) continue;
    collectPropertyNotes(lines, fieldSchema, normalized, `${stepId}.${fieldName}`, { mode: 'read', usageLabel: 'Usage', schemaDefinitions });
  }
  return lines;
}
