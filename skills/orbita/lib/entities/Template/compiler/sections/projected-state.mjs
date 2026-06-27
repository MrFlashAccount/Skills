import path from 'node:path';
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

function unambiguousArtifactPath(artifactPath, runDir) {
  if (path.isAbsolute(artifactPath)) return path.resolve(artifactPath);
  return runDir ? path.resolve(runDir, artifactPath) : artifactPath;
}

export function projectedArtifactReadItems(projection, { runDir } = {}) {
  const records = projectedArtifactRecords(projection);
  return records.map(({ stepId, artifact }) => ({
    label: `Projected artifact '${artifact.id}' from '${stepId}'`,
    path: unambiguousArtifactPath(artifact.path, runDir),
    contentType: artifact.content_type,
  }));
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
  const body = notes ? `${notes}\n\n${json}` : json;
  return `${body}\n`;
}
