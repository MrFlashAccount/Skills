import { readJson, readText } from '../../lib/persistence/json-io.mjs';
import { loadOutputSchema } from '../../lib/persistence/output-schema.mjs';
import { defaultRepositoryRootForWorkflow, readWorkflowFileRef } from '../../lib/persistence/resource-resolver.mjs';
import { assertRoleDirectoryName, listAllowedWorkflowRoles, readRoleMaterialFile } from '../../lib/persistence/role-material.mjs';
import {
  commitDurableRunState,
  createHistoryFileIfMissing,
  createJsonFileIfMissing,
  ensureRunStorage,
  managedJsonFileExists,
  pathExists,
  recoverDurableCommit,
  resolveRunPaths,
  withContinueRunLock,
} from '../../lib/persistence/run-state.mjs';

export const resourceAdapters = {
  readJson,
  readText,
  loadOutputSchema,
  defaultRepositoryRootForWorkflow,
  readWorkflowFileRef,
  assertRoleDirectoryName,
  listAllowedWorkflowRoles,
  readRoleMaterialFile,
  commitDurableRunState,
  createHistoryFileIfMissing,
  createJsonFileIfMissing,
  ensureRunStorage,
  managedJsonFileExists,
  pathExists,
  recoverDurableCommit,
  resolveRunPaths,
  withContinueRunLock,
};
