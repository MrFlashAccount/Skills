import path from 'node:path';
import { projectState } from './state-projection.mjs';
import { assertRoleDirectoryName } from './role-ref.mjs';

function roleMaterialRecords(resources, role) {
  const materials = resources?.roleMaterials ?? {};
  const loaded = materials instanceof Map ? materials.get(role) : materials[role];
  if (!loaded) throw new Error(`workflow prompt render failed: missing role material for input.role '${role}'`);
  return loaded instanceof Map ? [...loaded.values()] : Object.values(loaded);
}

function readInputRole({ input, resources }) {
  const role = input?.role;
  if (!role) return { readItems: [], metadataPaths: [] };
  assertRoleDirectoryName(role, { errorPrefix: 'workflow prompt render failed' });
  const records = roleMaterialRecords(resources, role);
  for (const record of records) {
    if (typeof record?.content !== 'string') {
      const pathSuffix = record?.path ? `: ${record.path}` : '';
      throw new Error(`workflow prompt render failed: missing role material for input.role '${role}'${pathSuffix}`);
    }
  }
  return {
    readItems: records.map((record) => ({
      label: `Role material for '${role}'`,
      path: record.path,
    })),
    metadataPaths: records.map((record) => record.path),
  };
}

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

function resolvedArtifactPath({ artifactPath, resources }) {
  if (typeof resources?.resolveRunArtifactPath === 'function') return resources.resolveRunArtifactPath(artifactPath);
  if (path.isAbsolute(artifactPath)) return path.resolve(artifactPath);
  throw new Error(`workflow prompt render failed: projected artifact path must be absolute before template compilation: ${artifactPath}`);
}

function projectedArtifactReadItems(projection, resources) {
  return projectedArtifactRecords(projection).map(({ stepId, artifact }) => ({
    label: `Projected artifact '${artifact.id}' from '${stepId}'`,
    path: resolvedArtifactPath({ artifactPath: artifact.path, resources }),
    contentType: artifact.content_type,
  }));
}

export function prepareWorkflowPromptContext({ baton, stepId, step, resources } = {}) {
  const input = step?.input ?? {};
  const selectors = input.state ?? [];
  const projection = projectState({ batonState: baton?.state ?? {}, selectors, stepId });
  const inputRole = readInputRole({ input, resources });
  return {
    projection,
    requiredReads: [
      ...inputRole.readItems,
      ...projectedArtifactReadItems(projection, resources),
    ],
    roleMetadataPaths: inputRole.metadataPaths,
  };
}
