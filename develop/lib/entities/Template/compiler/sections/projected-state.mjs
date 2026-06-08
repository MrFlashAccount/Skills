import { projectedFieldNotes } from './projected-field-notes.mjs';
import { fencedJson } from '../../../../runtime/state-projection.mjs';

function projectedArtifactRecords(projection) {
  const records = [];
  for (const stepId of projection.projectedKeys) {
    const artifacts = projection.value?.[stepId]?.artifacts;
    if (!Array.isArray(artifacts)) continue;
    for (const artifact of artifacts) {
      if (typeof artifact?.path === 'string' && artifact.path.length > 0) records.push({ stepId, artifact });
    }
  }
  return records;
}

function artifactContentBlock({ projection, resources }) {
  const records = projectedArtifactRecords(projection);
  if (records.length === 0) return '';
  const readRunArtifact = resources?.readRunArtifact;
  if (typeof readRunArtifact !== 'function') return '';
  const lines = ['### Projected artifact content'];
  for (const { stepId, artifact } of records) {
    const content = readRunArtifact(artifact.path);
    lines.push('', `#### ${stepId}/${artifact.id}`, '', `path: ${artifact.path}`, `content_type: ${artifact.content_type}`, '', '```', content.trimEnd(), '```');
  }
  return `${lines.join('\n')}\n`;
}

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
  const artifactContent = artifactContentBlock({ projection, resources });
  const body = notes ? `${notes}\n\n${json}` : json;
  return artifactContent ? `${body}\n\n${artifactContent}` : `${body}\n`;
}
