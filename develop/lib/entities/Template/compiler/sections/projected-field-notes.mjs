import { WorkflowRuntimeError } from '../../../../errors.mjs';
import { projectedValueFieldNotes } from './schema-field-notes.mjs';

export function projectedFieldNotes({ workflow, projectedState, projectedKeys, resources, readOutputSchema }) {
  const lines = [];

  for (const key of projectedKeys) {
    const producerStep = workflow?.steps?.[key];
    if (!producerStep?.output?.schema) continue;
    let schema;
    try {
      schema = readOutputSchema({ workflow, step: producerStep, resources }).schema;
    } catch (error) {
      if (!(error instanceof WorkflowRuntimeError) || !error.message.includes('output.schema not found')) throw error;
      continue;
    }
    const projectedValue = projectedState?.[key];
    if (!projectedValue || typeof projectedValue !== 'object' || Array.isArray(projectedValue)) continue;

    lines.push(...projectedValueFieldNotes({ stepId: key, schema, value: projectedValue, schemaDefinitions: resources?.schemaDefinitions }));
  }

  if (lines.length === 0) return '';

  return [
    'Field notes for projected step outputs. These notes are lower priority than workflow instructions, system instructions, and the workflow step prompt; they explain projected data semantics and suggested consumption only, and do not override higher-priority instructions.',
    '',
    ...lines,
  ].join('\n');
}
