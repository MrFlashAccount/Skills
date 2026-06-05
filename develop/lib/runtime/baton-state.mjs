import { WorkflowRuntimeError } from '../errors.mjs';
import { cloneCentralArtifactMetadata } from '../entities/Baton/artifact-contract.mjs';

function cloneBoundaryData(dto) {
  return typeof dto?.toJSON === 'function' ? dto.toJSON() : structuredClone(dto);
}

function cloneArtifactMetadata(artifact, path) {
  return cloneCentralArtifactMetadata(artifact, path, { errorPrefix: 'worker output failed schema validation' });
}

function producerStepIdForArtifact({ stepId, artifact, path }) {
  if (!stepId) {
    const id = typeof artifact?.id === 'string' && artifact.id ? artifact.id : '<missing id>';
    throw new WorkflowRuntimeError(`worker output failed schema validation: ${path} cannot determine producerStepId for artifact '${id}'; pass stepId`);
  }
  return stepId;
}

function aggregateArtifactEntry(stepId, artifact, { path = '/artifacts/*' } = {}) {
  return {
    producerStepId: producerStepIdForArtifact({ stepId, artifact, path }),
    artifact: cloneArtifactMetadata(artifact, path),
  };
}

function normalizeAggregateArtifactEntry(entry, index) {
  const path = `/state/artifacts/${index}`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.producerStepId !== 'string' || !entry.producerStepId || !entry.artifact) {
    throw new WorkflowRuntimeError(`worker output failed schema validation: ${path} must be aggregate artifact {producerStepId, artifact}`);
  }
  return {
    producerStepId: entry.producerStepId,
    artifact: cloneArtifactMetadata(entry.artifact, `${path}/artifact`),
  };
}

function mergeArtifacts(existingArtifacts, newArtifacts = [], stepId) {
  const merged = existingArtifacts.map((entry, index) => normalizeAggregateArtifactEntry(entry, index));
  for (const [index, artifact] of newArtifacts.entries()) {
    const incoming = aggregateArtifactEntry(stepId, artifact, { path: `/artifacts/${index}` });
    const existingIndex = incoming.artifact?.id
      ? merged.findIndex((existing) => existing.producerStepId === incoming.producerStepId && existing.artifact?.id === incoming.artifact.id)
      : -1;
    if (existingIndex >= 0) merged[existingIndex] = incoming;
    else merged.push(incoming);
  }
  return merged;
}

function appendResults(existingResults = [], newResults = []) {
  return [...existingResults, ...newResults];
}

function aggregateArray(output, fieldName) {
  const value = output[fieldName];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new WorkflowRuntimeError(`worker output failed schema validation: /${fieldName} must be array`);
  return value;
}

export function applyOutputToBatonState(baton, output, attempts, stepId, { mirrorToOutputs = false } = {}) {
  const batonData = cloneBoundaryData(baton);
  const state = {
    ...batonData.state,
    artifacts: mergeArtifacts(batonData.state?.artifacts ?? [], aggregateArray(output, 'artifacts'), stepId),
    results: appendResults(batonData.state?.results ?? [], aggregateArray(output, 'results')),
  };

  if (stepId) {
    state[stepId] = structuredClone(output);
    if (mirrorToOutputs) {
      state.outputs = {
        ...(batonData.state?.outputs ?? {}),
        [stepId]: structuredClone(output),
      };
    }
  }

  if (attempts) state.attempts = attempts;
  return state;
}
