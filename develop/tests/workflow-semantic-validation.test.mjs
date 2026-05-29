import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import workflowDoc from '../dev-harness.workflow.json' with { type: 'json' };
import { WorkflowInterpreterError } from '../lib/workflow/errors.mjs';
import { validateWorkflowDocument } from '../lib/validate/workflow-validator.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function validate(doc) {
  return validateWorkflowDocument(doc, { workflowPath: path.join(REPO_ROOT, 'develop/dev-harness.workflow.json'), repositoryRoot: REPO_ROOT });
}

function assertSemanticFailure(doc, pattern) {
  assert.throws(() => validate(doc), (error) => {
    assert.equal(error instanceof WorkflowInterpreterError, true);
    assert.match(error.message, pattern);
    return true;
  });
}

test('workflow semantic validation accepts the checked-in DevHarness workflow', () => {
  assert.deepEqual(validate(workflowDoc), { ok: true, workflow: 'dev-harness', steps: Object.keys(workflowDoc.workflow.steps).length });
});

test('workflow semantic validation warns when DevHarness described fields lack x-usage', () => {
  const doc = structuredClone(workflowDoc);
  doc.workflow.steps.research_draft.output.schema = 'develop/tests/fixtures/research-draft-missing-x-usage.schema.json';

  const result = validate(doc);

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /research_packet\.scope.*no x-usage/);
});

test('workflow semantic validation rejects schema-declared dynamic targets that are not workflow steps', () => {
  const doc = structuredClone(workflowDoc);
  doc.workflow.steps.review_join.output.schema = 'develop/tests/fixtures/review-join-output-unknown-target.schema.json';

  assertSemanticFailure(doc, /review_join.*output\.next.*unknown_step/);
});

test('workflow semantic validation rejects missing match cases from output schema enums', () => {
  const doc = structuredClone(workflowDoc);
  delete doc.workflow.steps.research_draft.next.cases.blocked;

  assertSemanticFailure(doc, /research_draft.*next\.cases is missing schema-declared case 'blocked'/);
});

test('workflow semantic validation rejects unreachable match cases not present in output schema enums', () => {
  const doc = structuredClone(workflowDoc);
  doc.workflow.steps.research_draft.next.cases.unreachable = 'blocked';

  assertSemanticFailure(doc, /research_draft.*unreachable case 'unreachable'/);
});
