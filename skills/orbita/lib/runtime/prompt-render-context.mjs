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

function projectedArtifactItems(projection, resources) {
  return projectedArtifactRecords(projection).map(({ stepId, artifact }) => ({
    id: artifact.id,
    label: `Projected artifact '${artifact.id}' from '${stepId}'`,
    path: resolvedArtifactPath({ artifactPath: artifact.path, resources }),
    sourceStepId: stepId,
    contentType: artifact.content_type,
  }));
}

function projectedSummaryItems(projection) {
  const items = [];
  for (const stepId of projection.projectedKeys) {
    const value = projection.value?.[stepId];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;

    if (typeof value.approval === 'string' && value.approval.length > 0) {
      items.push({ sourceStepId: stepId, kind: 'approval', summary: value.approval });
    }

    if (Array.isArray(value.results)) {
      for (const result of value.results) {
        if (typeof result?.summary === 'string' && result.summary.trim().length > 0) {
          items.push({ sourceStepId: stepId, kind: 'result', summary: result.summary.trim() });
        }
      }
    }

    if (Array.isArray(value.artifacts)) {
      for (const artifact of value.artifacts) {
        if (typeof artifact?.summary === 'string' && artifact.summary.trim().length > 0) {
          const id = typeof artifact.id === 'string' && artifact.id.length > 0 ? ` '${artifact.id}'` : '';
          items.push({ sourceStepId: stepId, kind: 'artifact', summary: `Artifact${id}: ${artifact.summary.trim()}` });
        }
      }
    }
  }
  return items;
}

export function prepareWorkflowPromptContext({ baton, stepId, step, resources } = {}) {
  const input = step?.input ?? {};
  const selectors = input.state ?? [];
  const projection = projectState({ batonState: baton?.state ?? {}, selectors, stepId });
  const inputRole = readInputRole({ input, resources });
  const projectedArtifacts = projectedArtifactItems(projection, resources);
  return {
    projection,
    projectedArtifacts,
    projectedSummaries: projectedSummaryItems(projection),
    requiredReads: [
      ...inputRole.readItems,
      ...projectedArtifacts,
    ],
    roleMetadataPaths: inputRole.metadataPaths,
  };
}
