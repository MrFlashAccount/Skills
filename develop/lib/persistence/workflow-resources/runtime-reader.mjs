import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { readWorkflowFileRef, defaultRepositoryRootForWorkflow } from './resource-resolver.mjs';
import { loadOutputSchema } from './output-schema-loader.mjs';
import { isInside } from '../filesystem/path-safety.mjs';
import { WorkflowRuntimeError } from '../../errors.mjs';
import { listAllowedWorkflowRoles, workflowRoleMaterialPath, REQUIRED_WORKFLOW_ROLE_MATERIAL_FILES } from './role-material-catalog.mjs';
import { assertWorkflowSchema } from '../../entities/Workflow/schema/workflow-schema.mjs';
import { assertBatonSchema } from '../../entities/Baton/schema/baton-schema.mjs';

function readJson(pathname, kind) {
  try {
    return JSON.parse(readFileSync(pathname, 'utf8'));
  } catch (error) {
    throw new WorkflowRuntimeError(`failed to read ${kind} JSON '${pathname}': ${error.message}`);
  }
}

function templateRefs(workflow) {
  const refs = [];
  const seen = new Set();
  for (const step of Object.values(workflow?.steps ?? {})) {
    for (const [fieldName, ref] of [['input', step?.input?.template], ['output', step?.output?.template]]) {
      if (!ref || seen.has(`${fieldName}:${ref}`)) continue;
      seen.add(`${fieldName}:${ref}`);
      refs.push({ ref, fieldName });
    }
  }
  return refs;
}

function schemaRefs(workflow) {
  const refs = new Set();
  for (const step of Object.values(workflow?.steps ?? {})) if (step?.output?.schema) refs.add(step.output.schema);
  return refs;
}

function roleNames(workflow) {
  const roles = new Set();
  for (const step of Object.values(workflow?.steps ?? {})) if (step?.input?.role) roles.add(step.input.role);
  return roles;
}

function isDeferredMissingResource(error) {
  return error instanceof WorkflowRuntimeError && /\b(missing|not found)\b/.test(error.message);
}

function loadTemplates({ workflow, workflowPath, repositoryRoot }) {
  const templates = {};
  for (const { ref, fieldName } of templateRefs(workflow)) {
    try {
      templates[ref] = readWorkflowFileRef({ workflowPath, fileRef: ref, kind: 'template', fieldName, messagePrefix: 'workflow prompt render failed', repositoryRoot });
    } catch (error) {
      if (!isDeferredMissingResource(error)) throw error;
      // Missing templates are reported by the Template entity only if the current render actually needs them.
    }
  }
  return templates;
}

function loadSchemas({ workflow, workflowPath, repositoryRoot }) {
  const outputSchemas = {};
  for (const schemaRef of schemaRefs(workflow)) {
    try {
      outputSchemas[schemaRef] = loadOutputSchema({ workflow, workflowPath, schemaRef, repositoryRoot, messagePrefix: 'workflow prompt render failed' });
    } catch (error) {
      if (!isDeferredMissingResource(error)) throw error;
      // Missing schemas are reported when a rendered/applied step needs the schema.
    }
  }
  return outputSchemas;
}

function readRoleMaterialFile({ root, role, fileName }) {
  const relative = workflowRoleMaterialPath(role, fileName);
  const candidate = path.join(root, relative);
  let resolvedPath;
  try {
    resolvedPath = realpathSync(candidate);
  } catch {
    return { path: relative };
  }
  if (!isInside(resolvedPath, root)) {
    throw new WorkflowRuntimeError(`workflow prompt render failed: input.role material escapes repository root: ${relative}`);
  }
  return { content: readFileSync(resolvedPath, 'utf8'), path: relative };
}

function loadRoleMaterials({ workflow, repositoryRoot }) {
  const root = realpathSync(repositoryRoot);
  const roleMaterials = {};
  for (const role of roleNames(workflow)) {
    roleMaterials[role] = REQUIRED_WORKFLOW_ROLE_MATERIAL_FILES.map((fileName) => readRoleMaterialFile({ root, role, fileName }));
    // Missing role material content is reported by Template only when a rendered step needs it.
  }
  return roleMaterials;
}

export function loadWorkflowResources({ workflow, workflowPath, repositoryRoot = defaultRepositoryRootForWorkflow(workflowPath) }) {
  return {
    templates: loadTemplates({ workflow, workflowPath, repositoryRoot }),
    outputSchemas: loadSchemas({ workflow, workflowPath, repositoryRoot }),
    roleMaterials: loadRoleMaterials({ workflow, repositoryRoot }),
    allowedRoles: listAllowedWorkflowRoles({ repositoryRoot }),
  };
}

export function loadWorkflowRuntime({ workflowPath, batonPath, baton }) {
  const workflow = readJson(workflowPath, 'workflow');
  assertWorkflowSchema(workflow);
  const batonDoc = baton ?? readJson(batonPath, 'baton');
  assertBatonSchema(batonDoc);
  const repositoryRoot = defaultRepositoryRootForWorkflow(workflowPath);
  return {
    workflow,
    baton: batonDoc,
    resources: loadWorkflowResources({ workflow, workflowPath, repositoryRoot }),
    repositoryRoot,
  };
}

export function readWorkerOutputValue({ outputPath, name = 'worker output' }) {
  return readJson(outputPath, name);
}

export function readWorkerOutputText({ outputPath }) {
  return readFileSync(outputPath, 'utf8');
}
