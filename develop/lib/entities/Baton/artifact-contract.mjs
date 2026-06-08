import fsPath from 'node:path';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { batonSchema } from './schema/baton-schema.mjs';

const artifactSchema = batonSchema.$defs.artifact;
const ARTIFACT_FIELDS = Object.freeze(Object.keys(artifactSchema.properties));
const REQUIRED_ARTIFACT_FIELDS = Object.freeze(artifactSchema.required);

function message({ errorPrefix, path, detail }) {
  return `${errorPrefix}: ${path} ${detail}`;
}

export function assertCentralArtifactMetadata(artifact, path, { errorPrefix }) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    throw new WorkflowRuntimeError(message({ errorPrefix, path, detail: 'must be object' }));
  }

  for (const field of Object.keys(artifact)) {
    if (!ARTIFACT_FIELDS.includes(field)) {
      throw new WorkflowRuntimeError(message({ errorPrefix, path: `${path}/${field}`, detail: 'is not allowed' }));
    }
  }

  for (const field of REQUIRED_ARTIFACT_FIELDS) {
    if (typeof artifact[field] !== 'string' || artifact[field].length === 0) {
      throw new WorkflowRuntimeError(message({ errorPrefix, path: `${path}/${field}`, detail: 'must be non-empty string' }));
    }
  }

  for (const [field, fieldSchema] of Object.entries(artifactSchema.properties)) {
    if (!REQUIRED_ARTIFACT_FIELDS.includes(field) && Object.hasOwn(artifact, field)) {
      if (fieldSchema.type === 'string' && typeof artifact[field] !== 'string') {
        throw new WorkflowRuntimeError(message({ errorPrefix, path: `${path}/${field}`, detail: 'must be string' }));
      }
      if (fieldSchema.minLength && artifact[field].length < fieldSchema.minLength) {
        throw new WorkflowRuntimeError(message({ errorPrefix, path: `${path}/${field}`, detail: `must be non-empty string` }));
      }
    }
  }

  if (!fsPath.isAbsolute(artifact.path)) {
    throw new WorkflowRuntimeError(message({ errorPrefix, path: `${path}/path`, detail: 'must be full absolute filesystem path' }));
  }
}

export function cloneCentralArtifactMetadata(artifact, path, options) {
  assertCentralArtifactMetadata(artifact, path, options);
  return structuredClone(artifact);
}
