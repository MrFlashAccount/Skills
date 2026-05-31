import { projectedFieldNotes } from './projected-field-notes.mjs';
import { fencedJson } from '../../step-helpers/projection.mjs';

export function projectedStateBlock({ workflow, projection, resources, readOutputSchema }) {
  if (projection.projectedKeys.length === 0) return '';
  const notes = projectedFieldNotes({
    workflow,
    projectedState: projection.value,
    projectedKeys: projection.projectedKeys,
    resources,
    readOutputSchema,
  });
  const json = fencedJson(projection.value).trimEnd();
  return notes ? `${notes}\n\n${json}\n` : `${json}\n`;
}
