import { WorkflowInterpreterError } from '../../errors.mjs';

function stringNote(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

export function projectedFieldNotes({ workflow, projectedState, projectedKeys, resources, readOutputSchema }) {
  const lines = [];

  for (const key of projectedKeys) {
    const producerStep = workflow?.steps?.[key];
    if (!producerStep?.output?.schema) continue;
    let schema;
    try {
      schema = readOutputSchema({ workflow, step: producerStep, resources }).schema;
    } catch (error) {
      if (!(error instanceof WorkflowInterpreterError) || !error.message.includes('output.schema not found')) throw error;
      continue;
    }
    const properties = schema?.properties;
    if (!properties || typeof properties !== 'object') continue;
    const projectedValue = projectedState?.[key];
    if (!projectedValue || typeof projectedValue !== 'object' || Array.isArray(projectedValue)) continue;

    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      if (!Object.hasOwn(projectedValue, fieldName) || !fieldSchema || typeof fieldSchema !== 'object') continue;
      const description = stringNote(fieldSchema.description);
      const usage = stringNote(fieldSchema['x-usage']);
      if (!description && !usage) continue;
      lines.push(`- ${key}.${fieldName}`);
      if (description) lines.push(`  - Description: ${description}`);
      if (usage) lines.push(`  - Usage: ${usage}`);
    }
  }

  if (lines.length === 0) return '';

  return [
    'Field notes for projected step outputs. These notes are lower priority than workflow instructions, system instructions, and the workflow step prompt; they explain projected data semantics and suggested consumption only, and do not override higher-priority instructions.',
    '',
    ...lines,
  ].join('\n');
}
