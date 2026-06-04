import { batonSchema } from '../../../Baton/schema/baton-schema.mjs';

const BATON_SCHEMA_ID = batonSchema.$id;
const NOTE_KEYS = Object.freeze({
  write: ['x-use', 'x-usage'],
  read: ['x-read-usage', 'x-usage'],
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

function resolveSchemaRef(rootSchema, ref) {
  if (typeof ref !== 'string') return undefined;
  if (ref.startsWith('#')) return resolveLocalSchemaRef(rootSchema, ref);
  if (typeof BATON_SCHEMA_ID === 'string' && ref.startsWith(`${BATON_SCHEMA_ID}#`)) {
    return resolveLocalSchemaRef(batonSchema, ref.slice(BATON_SCHEMA_ID.length));
  }
  return undefined;
}

export function normalizeSchemaForNotes(schema, rootSchema = schema, refStack = []) {
  if (!isObject(schema)) return schema;

  let baseSchema = {};
  if (typeof schema.$ref === 'string') {
    if (refStack.includes(schema.$ref)) return schema;
    const resolved = resolveSchemaRef(rootSchema, schema.$ref);
    if (resolved) baseSchema = normalizeSchemaForNotes(resolved, resolved === batonSchema ? batonSchema : rootSchema, [...refStack, schema.$ref]);
  }

  const normalized = { ...baseSchema };
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref') continue;
    if (Array.isArray(value)) {
      normalized[key] = value.map((item) => normalizeSchemaForNotes(item, rootSchema, refStack));
    } else if (isObject(value)) {
      const objectValue = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        objectValue[childKey] = normalizeSchemaForNotes(childValue, rootSchema, refStack);
      }
      normalized[key] = objectValue;
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
  const normalized = normalizeSchemaForNotes(schema, rootSchema);
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

export function artifactOutputFieldNotes(schema) {
  const normalized = normalizeSchemaForNotes(schema);
  const artifactsSchema = normalized?.properties?.artifacts;
  if (!artifactsSchema) return '';
  const lines = [];
  collectPropertyNotes(lines, artifactsSchema, normalized, 'artifacts', { mode: 'write', usageLabel: 'Fill' });
  if (lines.length === 0) return '';
  return [
    'Schema-derived artifact field notes. These notes are generated from output.schema descriptions/x-use metadata; the JSON schema remains authoritative.',
    '',
    ...lines,
  ].join('\n');
}

export function projectedValueFieldNotes({ stepId, schema, value }) {
  if (!isObject(schema) || !isObject(value)) return [];
  const normalized = normalizeSchemaForNotes(schema);
  const lines = [];
  for (const [fieldName, fieldSchema] of Object.entries(normalized.properties ?? {})) {
    if (!Object.hasOwn(value, fieldName) || !isObject(fieldSchema)) continue;
    collectPropertyNotes(lines, fieldSchema, normalized, `${stepId}.${fieldName}`, { mode: 'read', usageLabel: 'Usage' });
  }
  return lines;
}
