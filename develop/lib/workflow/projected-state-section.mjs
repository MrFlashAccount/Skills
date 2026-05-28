import { projectedFieldNotes } from './projected-field-notes.mjs';
import { fencedJson } from './projection.mjs';

export function projectedStateBlock({ workflow, projection, repositoryRoot, readOutputSchema }) {
  if (projection.projectedKeys.length === 0) return '';
  const notes = projectedFieldNotes({
    workflow,
    projectedState: projection.value,
    projectedKeys: projection.projectedKeys,
    repositoryRoot,
    readOutputSchema,
  });
  const json = fencedJson(projection.value).trimEnd();
  return notes ? `${notes}\n\n${json}\n` : `${json}\n`;
}
