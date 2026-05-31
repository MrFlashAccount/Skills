import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readJson } from './json-io.mjs';
import { readWorkflowFileRef, defaultRepositoryRootForWorkflow } from './resource-resolver.mjs';
import { loadOutputSchema } from './output-schema.mjs';
import { roleMaterialPath, REQUIRED_ROLE_MATERIAL_FILES } from '../entities/workflow-helpers/roles.mjs';

function templateRefs(workflow) {
  const refs = new Set();
  for (const step of Object.values(workflow?.steps ?? {})) {
    if (step?.input?.template) refs.add(step.input.template);
    if (step?.output?.template) refs.add(step.output.template);
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

export function listAllowedWorkflowRoles({ repositoryRoot }) {
  const root = realpathSync(repositoryRoot);
  const rolesRoot = path.join(root, 'roles');
  let entries;
  try {
    entries = readdirSync(rolesRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((role) => /^[A-Za-z0-9_-]+$/.test(role))
    .filter((role) => REQUIRED_ROLE_MATERIAL_FILES.every((fileName) => existsSync(path.join(rolesRoot, role, fileName))))
    .sort();
}

function loadTemplates({ workflow, workflowPath, repositoryRoot }) {
  const templates = {};
  for (const ref of templateRefs(workflow)) {
    try {
      templates[ref] = readWorkflowFileRef({ workflowPath, fileRef: ref, kind: 'template', fieldName: 'template', messagePrefix: 'workflow prompt render failed', repositoryRoot });
    } catch {
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
    } catch {
      // Missing schemas are reported when a rendered/applied step needs the schema.
    }
  }
  return outputSchemas;
}

function loadRoleMaterials({ workflow, repositoryRoot }) {
  const root = realpathSync(repositoryRoot);
  const roleMaterials = {};
  for (const role of roleNames(workflow)) {
    roleMaterials[role] = {};
    for (const fileName of REQUIRED_ROLE_MATERIAL_FILES) {
      const relative = roleMaterialPath(role, fileName);
      try {
        roleMaterials[role][fileName] = { content: readFileSync(path.join(root, relative), 'utf8'), path: relative };
      } catch {
        // Missing role material is reported by Template only when a rendered step needs it.
      }
    }
  }
  return roleMaterials;
}

export function loadWorkflowRuntime({ workflowPath, batonPath, baton }) {
  const workflow = readJson(workflowPath, 'workflow');
  const batonDoc = baton ?? readJson(batonPath, 'baton');
  const repositoryRoot = defaultRepositoryRootForWorkflow(workflowPath);
  return {
    workflow,
    baton: batonDoc,
    resources: {
      templates: loadTemplates({ workflow, workflowPath, repositoryRoot }),
      outputSchemas: loadSchemas({ workflow, workflowPath, repositoryRoot }),
      roleMaterials: loadRoleMaterials({ workflow, repositoryRoot }),
      allowedRoles: listAllowedWorkflowRoles({ repositoryRoot }),
    },
    repositoryRoot,
  };
}

export function readWorkerOutputValue({ outputPath, name = 'worker output' }) {
  return readJson(outputPath, name);
}

export function readWorkerOutputText({ outputPath }) {
  return readFileSync(outputPath, 'utf8');
}
