import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import researchCriticWorkflowDoc from '../../../workflows/research-critic/workflow.json' with { type: 'json' };
import { Workflow } from '../entities/Workflow/index.mjs';
import { loadInstructions as runnerLoadInstructions, next as runnerNext } from '../entrypoints/api/workflowRunner.mjs';
import { validateWorkflowFile } from '../entrypoints/api/validateWorkflow.mjs';
import { workflowSemanticValidationOptions } from '../use-cases/workflow-semantic-validation.mjs';
import { readAllowedRoles, readOutputSchemas } from '../persistence/workflow-resources/workflow-file-reader.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-validation-parity-'));
after(() => rmSync(tempDir, { recursive: true, force: true }));

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parityWorkflowDoc(schemaRef) {
  return {
    name: 'workflow-validation-parity-fixture',
    version: 1,
    start: 'prepare',
    done: 'done',
    blocked: 'blocked',
    steps: {
      prepare: {
        name: 'Prepare',
        kind: 'worker',
        input: { prompt: 'Prepare baton-linked output.' },
        output: { template: 'output.md', schema: schemaRef },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
  };
}

test('validate-workflow, direct Workflow validation, Workflow.validateOutputSchemas, and workflow-runner share baton $ref semantic-validation parity', async () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/research-critic/workflow.json');
  const outputSchemas = readOutputSchemas({ workflow: researchCriticWorkflowDoc, workflowPath, repositoryRoot: REPO_ROOT });
  const allowedRoles = readAllowedRoles({ repositoryRoot: REPO_ROOT });
  const validationOptions = workflowSemanticValidationOptions({ outputSchemas, allowedRoles });
  const directValidation = new Workflow(researchCriticWorkflowDoc).validate(validationOptions);
  const schemaValidation = new Workflow(researchCriticWorkflowDoc).validateOutputSchemas(validationOptions.outputSchemas, validationOptions);
  const validation = validateWorkflowFile(workflowPath);

  assert.deepEqual(directValidation, {
    ok: true,
    workflow: 'research-critic',
    steps: Object.keys(researchCriticWorkflowDoc.steps).length,
  });
  assert.equal(schemaValidation.ok, true);
  assert.equal(schemaValidation.warnings.length, 0);
  assert.equal(schemaValidation.schemasByStep.has('save_research_packet'), true);
  assert.deepEqual(validation, {
    ok: true,
    workflow: 'research-critic',
    steps: Object.keys(researchCriticWorkflowDoc.steps).length,
  });

  const runId = `workflow-validation-parity-${process.pid}-research-critic`;
  const runsRoot = path.join(tempDir, 'research-critic-runs');
  const leaseToken = `workflow-validation-parity-token-${process.pid}`;
  process.env.WORKFLOW_RUN_TOKEN = leaseToken;

  const response = await runnerNext({ runId, workflowPath, runsRoot, leaseToken });
  assert.equal(response.status, 'needs_host_actions');
  assert.equal(response.requests[0].stepId, 'research_draft');

  const instructions = await runnerLoadInstructions({ runId, stepId: 'research_draft', runsRoot, leaseToken });
  assert.match(instructions, /Normalize the task input/);
});

test('validate-workflow and workflow-runner reject unresolved external refs with the same semantic failure', async () => {
  const workflowRoot = path.join(tempDir, 'missing-external-ref');
  const workflowPath = path.join(workflowRoot, 'workflow.json');
  const schemaRef = 'missing-external-output.schema.json';
  const missingRef = 'https://example.test/workflow/missing#/$defs/artifact';

  mkdirSync(workflowRoot, { recursive: true });
  writeFileSync(path.join(workflowRoot, 'output.md'), 'Return strict JSON.\n');
  writeJson(path.join(workflowRoot, schemaRef), {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['outcome', 'artifacts'],
    properties: {
      outcome: { enum: ['ok'] },
      artifacts: {
        type: 'array',
        items: { $ref: missingRef },
      },
    },
    additionalProperties: false,
  });
  writeJson(workflowPath, parityWorkflowDoc(schemaRef));

  assert.throws(
    () => validateWorkflowFile(workflowPath),
    (error) => {
      assert.match(error.message, /output\.schema 'missing-external-output\.schema\.json' is not a valid JSON Schema/);
      assert.match(error.message, new RegExp(missingRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );

  const runId = `workflow-validation-parity-${process.pid}-missing-ref`;
  const runsRoot = path.join(tempDir, 'missing-ref-runs');
  const leaseToken = `workflow-validation-parity-missing-ref-token-${process.pid}`;
  process.env.WORKFLOW_RUN_TOKEN = leaseToken;

  await assert.rejects(
    () => runnerNext({ runId, workflowPath, runsRoot, leaseToken }),
    (error) => {
      assert.match(error.message, /output\.schema 'missing-external-output\.schema\.json' is not a valid JSON Schema/);
      assert.match(error.message, new RegExp(missingRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      return true;
    },
  );
});

test('workflow validation boundaries keep baton schema composition and Step entity materialization outside Workflow owner', () => {
  const adapterPaths = [
    'develop/lib/use-cases/ValidateWorkflow.mjs',
    'develop/lib/use-cases/runtime/guards/workflow.mjs',
    'develop/lib/use-cases/LoadInstructions.mjs',
  ];
  const workflowOwnerPaths = readdirSync(path.join(REPO_ROOT, 'develop/lib/entities/Workflow'))
    .filter((entry) => entry.endsWith('.mjs'))
    .map((entry) => path.join('develop/lib/entities/Workflow', entry));

  for (const relativePath of adapterPaths) {
    const source = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    assert.doesNotMatch(source, /baton-schema\.mjs/);
  }

  for (const relativePath of workflowOwnerPaths) {
    const source = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    assert.doesNotMatch(source, /Baton\/schema\/baton-schema\.mjs/);
  }

  const workflowIndex = readFileSync(path.join(REPO_ROOT, 'develop/lib/entities/Workflow/index.mjs'), 'utf8');
  assert.doesNotMatch(workflowIndex, /\.\.\/Step\/index\.mjs/);
});
