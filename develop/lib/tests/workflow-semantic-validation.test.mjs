import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import workflowDoc from '../../../workflows/dev-harness/workflow.json' with { type: 'json' };
import researchCriticWorkflowDoc from '../../../workflows/research-critic/workflow.json' with { type: 'json' };
import { WorkflowInterpreterError } from '../workflow/errors.mjs';
import { validateWorkflowDocument } from '../validate/workflow-validator.mjs';
import { validateAgainstOutputSchema } from '../workflow/output-schema-validation.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'workflow-semantic-validation-'));

function validate(doc) {
  return validateWorkflowDocument(doc, { workflowPath: path.join(REPO_ROOT, 'workflows/dev-harness/workflow.json'), repositoryRoot: REPO_ROOT });
}

function validateSynthetic(doc) {
  return validateWorkflowDocument(doc, { workflowPath: path.join(tempDir, 'workflow.json'), repositoryRoot: REPO_ROOT });
}

function assertSemanticFailure(doc, pattern) {
  assert.throws(() => validateSynthetic(doc), (error) => {
    assert.equal(error instanceof WorkflowInterpreterError, true);
    assert.match(error.message, pattern);
    return true;
  });
}

after(() => rmSync(tempDir, { recursive: true, force: true }));

function writeSchema(name, schema) {
  writeFileSync(path.join(tempDir, name), `${JSON.stringify(schema, null, 2)}\n`);
}

const routeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['outcome', 'route', 'next_steps'],
  properties: {
    outcome: { enum: ['ready', 'blocked'] },
    route: { enum: ['review', 'blocked'] },
    next_steps: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: ['branch_a', 'branch_b'] },
    },
  },
  additionalProperties: false,
};

writeSchema('route-output.schema.json', routeSchema);
writeSchema('bad-array-output.schema.json', {
  ...routeSchema,
  properties: {
    ...routeSchema.properties,
    next_steps: {
      type: 'array',
      items: { enum: ['branch_a', 'branch_b'] },
    },
  },
});
writeSchema('unknown-array-target-output.schema.json', {
  ...routeSchema,
  properties: {
    ...routeSchema.properties,
    next_steps: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { enum: ['branch_a', 'missing_branch'] },
    },
  },
});

function genericWorkflowWithWorkerRole(role) {
  return {
      name: 'generic-role-validation-fixture',
      version: 1,
      start: 'worker_step',
      done: 'done',
      blocked: 'blocked',
      steps: {
        worker_step: {
          name: 'Worker step',
          kind: 'worker',
          input: { role, prompt: 'Run worker.' },
          output: { template: 'worker.md' },
          next: 'done',
        },
        done: { name: 'Done', kind: 'done' },
        blocked: { name: 'Blocked', kind: 'blocked' },
      },

  };
}

function syntheticWorkflow(overrides) {
  const doc = {
      name: 'synthetic-validation-fixture',
      version: 1,
      start: 'producer',
      done: 'done',
      blocked: 'blocked',
      steps: {
        producer: {
          name: 'Producer',
          kind: 'worker',
          output: { template: 'producer.md', schema: 'route-output.schema.json' },
          next: { match: '${{ output.outcome }}', cases: { ready: 'consumer', blocked: 'blocked' } },
        },
        consumer: {
          name: 'Consumer',
          kind: 'worker',
          input: { state: ['producer'] },
          output: { template: 'consumer.md', schema: 'route-output.schema.json' },
          next: 'done',
        },
        branch_a: {
          name: 'Branch A',
          kind: 'worker',
          input: { state: ['producer'] },
          output: { template: 'branch-a.md', schema: 'route-output.schema.json' },
          next: 'join',
        },
        branch_b: {
          name: 'Branch B',
          kind: 'worker',
          input: { state: ['producer'] },
          output: { template: 'branch-b.md', schema: 'route-output.schema.json' },
          next: 'join',
        },
        join: {
          name: 'Join',
          kind: 'worker',
          input: { state: ['producer', 'branch_a', 'branch_b'] },
          output: { template: 'join.md', schema: 'route-output.schema.json' },
          next: 'done',
        },
        done: { name: 'Done', kind: 'done', input: { state: ['consumer'] } },
        blocked: { name: 'Blocked', kind: 'blocked', input: { state: ['producer'] } },
      },

  };
  return overrides?.(doc) ?? doc;
}

test('workflow semantic validation accepts the checked-in flat DevHarness workflow', () => {
  assert.equal(Object.hasOwn(workflowDoc, 'workflow'), false);
  assert.deepEqual(validate(workflowDoc), { ok: true, workflow: 'dev-harness', steps: Object.keys(workflowDoc.steps).length });
});

test('workflow semantic validation rejects wrapped workflow documents', () => {
  const flat = syntheticWorkflow();
  const wrapped = { workflow: structuredClone(flat) };

  assert.deepEqual(validateSynthetic(flat), { ok: true, workflow: 'synthetic-validation-fixture', steps: Object.keys(flat.steps).length });
  assertSemanticFailure(wrapped, /workflow failed schema validation/);
});

test('workflow semantic validation rejects workflow wrapper field on flat documents', () => {
  const flat = syntheticWorkflow();
  flat.workflow = structuredClone(syntheticWorkflow());

  assertSemanticFailure(flat, /workflow failed schema validation/);
});

test('research critic save step uses persistence metadata template matching its output schema', () => {
  const step = researchCriticWorkflowDoc.steps.save_research_packet;

  assert.equal(step.output.template, 'shared/templates/research-save-metadata-template.md');
  assert.equal(step.output.schema, 'workflows/research-critic/schemas/save-research-packet-output.json');
  assert.notEqual(step.output.template, 'shared/templates/research-packet-template.md');
  assert.deepEqual(validateWorkflowDocument(researchCriticWorkflowDoc, { workflowPath: path.join(REPO_ROOT, 'workflows/research-critic/workflow.json'), repositoryRoot: REPO_ROOT }), {
    ok: true,
    workflow: 'research-critic',
    steps: Object.keys(researchCriticWorkflowDoc.steps).length,
  });
});

test('research critic saved packet output requires projected artifacts and results', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/research-critic/workflow.json');
  const step = researchCriticWorkflowDoc.steps.save_research_packet;

  const missingProjection = validateAgainstOutputSchema({
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
    output: { outcome: 'saved', saved: { summary: 'Saved.', artifact_path: 'research/packet.md' } },
  });
  assert.equal(missingProjection.ok, false);
  assert.match(missingProjection.errors, /artifacts/);
  assert.match(missingProjection.errors, /results/);

  const emptyProjection = validateAgainstOutputSchema({
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
    output: { outcome: 'saved', saved: { summary: 'Saved.', artifact_path: 'research/packet.md' }, artifacts: [], results: [] },
  });
  assert.equal(emptyProjection.ok, false);
  assert.match(emptyProjection.errors, /artifacts/);
  assert.match(emptyProjection.errors, /results/);

  const withProjection = validateAgainstOutputSchema({
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
    output: {
      outcome: 'saved',
      saved: { summary: 'Saved.', artifact_path: 'research/packet.md' },
      artifacts: [{ type: 'research', summary: 'Saved packet.', path: 'research/packet.md' }],
      results: [{ summary: 'Saved packet.' }],
    },
  });
  assert.equal(withProjection.ok, true);
});

test('research critic save packet output keeps saved and blocked branches exclusive', () => {
  const workflowPath = path.join(REPO_ROOT, 'workflows/research-critic/workflow.json');
  const step = researchCriticWorkflowDoc.steps.save_research_packet;
  const schemaContext = {
    workflow: researchCriticWorkflowDoc,
    workflowPath,
    schemaRef: step.output.schema,
    repositoryRoot: REPO_ROOT,
  };

  const blockedWithProjection = validateAgainstOutputSchema({
    ...schemaContext,
    output: {
      outcome: 'blocked',
      blocker: { summary: 'Cannot save.', source_step_id: 'save_research_packet', needed: 'Writable target.' },
      saved: { summary: 'Should not coexist.', artifact_path: 'research/packet.md' },
      artifacts: [{ type: 'research', summary: 'Should not aggregate.', path: 'research/packet.md' }],
      results: [{ summary: 'Should not aggregate.' }],
    },
  });
  assert.equal(blockedWithProjection.ok, false);

  const savedWithBlocker = validateAgainstOutputSchema({
    ...schemaContext,
    output: {
      outcome: 'saved',
      saved: { summary: 'Saved.', artifact_path: 'research/packet.md' },
      artifacts: [{ type: 'research', summary: 'Saved packet.', path: 'research/packet.md' }],
      results: [{ summary: 'Saved packet.' }],
      blocker: { summary: 'Should not coexist.', source_step_id: 'save_research_packet', needed: 'Nothing.' },
    },
  });
  assert.equal(savedWithBlocker.ok, false);

  const blockedOnly = validateAgainstOutputSchema({
    ...schemaContext,
    output: { outcome: 'blocked', blocker: { summary: 'Cannot save.', source_step_id: 'save_research_packet', needed: 'Writable target.' } },
  });
  assert.equal(blockedOnly.ok, true);
});

test('workflow semantic validation rejects invalid worker roles in generic workflows', () => {
  const doc = genericWorkflowWithWorkerRole('missing-workflow-role');

  assert.throws(() => validate(doc), /step 'worker_step' input\.role 'missing-workflow-role' is not an allowed role/);
});

test('workflow semantic validation rejects step ids reserved for baton state bookkeeping', () => {
  for (const reservedStepId of ['artifacts', 'results', 'outputs', 'attempts']) {
    const doc = genericWorkflowWithWorkerRole('backend');
    doc.start = reservedStepId;
    doc.steps[reservedStepId] = {
      ...doc.steps.worker_step,
      name: `Reserved ${reservedStepId}`,
    };
    delete doc.steps.worker_step;

    assertSemanticFailure(doc, new RegExp(`workflow step id '${reservedStepId}' is reserved for runtime aggregate state`));
  }
});

test('workflow semantic validation warns when DevHarness described fields lack x-usage', () => {
  const doc = structuredClone(workflowDoc);
  doc.steps.research_draft.output.schema = 'develop/lib/tests/fixtures/research-draft-missing-x-usage.schema.json';

  const result = validate(doc);

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /research_packet\.scope.*no x-usage/);
});

test('workflow semantic validation rejects schema-declared dynamic targets that are not workflow steps', () => {
  const doc = structuredClone(workflowDoc);
  doc.steps.review_join.output.schema = 'develop/lib/tests/fixtures/review-join-output-unknown-target.schema.json';

  assertSemanticFailure(doc, /review_join.*output\.next.*unknown_step/);
});

test('workflow semantic validation rejects missing match cases from output schema enums', () => {
  const doc = structuredClone(workflowDoc);
  delete doc.steps.research_draft.next.cases.blocked;

  assertSemanticFailure(doc, /research_draft.*next\.cases is missing schema-declared case 'blocked'/);
});

test('workflow semantic validation rejects unreachable match cases not present in output schema enums', () => {
  const doc = structuredClone(workflowDoc);
  doc.steps.research_draft.next.cases.unreachable = 'blocked';

  assert.throws(() => validate(doc), /research_draft.*unreachable case 'unreachable'/);
});

test('workflow semantic validation rejects malformed workflow names', () => {
  const doc = syntheticWorkflow((draft) => {
    draft.name = '../not-a-workflow-name';
    return draft;
  });

  assertSemanticFailure(doc, /workflow name must be a non-empty lowercase kebab-case identifier/);
});

test('workflow semantic validation accepts input.state selectors that reference declared workflow step ids', () => {
  assert.deepEqual(validateSynthetic(syntheticWorkflow()), { ok: true, workflow: 'synthetic-validation-fixture', steps: 7 });

  const doc = syntheticWorkflow((draft) => {
    draft.steps.approval_gate = {
      name: 'Approval gate',
      kind: 'approval',
      next: { match: '${{ output.approval }}', cases: { approved: 'consumer', blocked: 'blocked' } },
    };
    draft.steps.consumer.input.state = ['approval_gate'];
    return draft;
  });

  assert.deepEqual(validateSynthetic(doc), { ok: true, workflow: 'synthetic-validation-fixture', steps: 8 });
});

test('workflow semantic validation accepts input expressions against projected input.state selectors', () => {
  const doc = syntheticWorkflow((draft) => {
    draft.steps.consumer.input = { state: ['producer', 'branch_a'] };
    draft.steps.consumer.next = { match: '${{ input.branch_a.outcome }}', cases: { ready: 'done', blocked: 'blocked' } };
    return draft;
  });

  assert.deepEqual(validateSynthetic(doc), { ok: true, workflow: 'synthetic-validation-fixture', steps: 7 });
});

test('workflow semantic validation rejects input.state selectors that do not name own workflow step ids', () => {
  for (const selector of ['missing_step', '__proto__', 'toString']) {
    assertSemanticFailure(
      syntheticWorkflow((draft) => {
        draft.steps.consumer.input.state = [selector];
        return draft;
      }),
      new RegExp(`consumer.*input\\.state selector '${selector}'.*declared workflow step`),
    );
  }

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.input.state = ['artifacts', 'results', 'outputs'];
      return draft;
    }),
    /consumer.*input\.state selector 'artifacts'.*reserved for runtime aggregate state/,
  );
});

test('workflow semantic validation rejects declared step ids reserved for aggregate runtime state', () => {
  for (const reservedStepId of ['artifacts', 'results', 'outputs', 'attempts']) {
    assertSemanticFailure(
      syntheticWorkflow((draft) => {
        draft.steps[reservedStepId] = {
          name: `Reserved ${reservedStepId}`,
          kind: 'worker',
          output: { template: `${reservedStepId}.md`, schema: 'route-output.schema.json' },
          next: 'done',
        };
        return draft;
      }),
      new RegExp(`workflow step id '${reservedStepId}'.*reserved for runtime aggregate state`),
    );
  }
});

test('workflow semantic validation rejects unsupported nested input.state selectors', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.input.state = ['producer.route'];
      return draft;
    }),
    /consumer.*input\.state selector 'producer\.route' is invalid/,
  );
});

test('workflow semantic validation rejects projected input expressions with unknown schema fields', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.next = { match: '${{ input.producer.missing_route }}', cases: { review: 'done', blocked: 'blocked' } };
      return draft;
    }),
    /consumer.*input\.producer\.missing_route.*no schema-covered path/,
  );
});

test('workflow semantic validation rejects aggregate runtime state expressions in input transitions', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.consumer.next = { match: '${{ input.outputs.producer.route }}', cases: { review: 'done', blocked: 'blocked' } };
      return draft;
    }),
    /consumer.*input\.outputs\.producer\.route.*does not project input state 'outputs'/,
  );
});

test('workflow semantic validation rejects unsafe dynamic array target schemas', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.next = '${{ output.next_steps }}';
      draft.steps.producer.output.schema = 'bad-array-output.schema.json';
      return draft;
    }),
    /producer.*output\.next_steps.*array target schema must declare minItems >= 1/,
  );

  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.next = '${{ output.next_steps }}';
      draft.steps.producer.output.schema = 'unknown-array-target-output.schema.json';
      return draft;
    }),
    /producer.*output\.next_steps.*target not found: missing_branch/,
  );
});

test('workflow semantic validation rejects dynamic array target schemas with invalid join shape', () => {
  assertSemanticFailure(
    syntheticWorkflow((draft) => {
      draft.steps.producer.next = '${{ output.next_steps }}';
      draft.steps.branch_b.next = 'done';
      return draft;
    }),
    /producer.*output\.next_steps.*parallel branch targets must share one explicit join step/,
  );
});


test('workflow semantic validation uses approval output.schema for output match cases when declared', () => {
  const doc = {
      name: 'approval-schema-routing-fixture',
      version: 1,
      start: 'approve',
      done: 'done',
      blocked: 'blocked',
      steps: {
        approve: {
          name: 'Approve',
          kind: 'approval',
          input: { prompt: 'Choose ship or revise.' },
          output: { schema: 'develop/lib/tests/fixtures/approval-choice-output.schema.json' },
          next: { match: '${{ output.choice }}', cases: { ship: 'done' } },
        },
        done: { name: 'Done', kind: 'done' },
        blocked: { name: 'Blocked', kind: 'blocked' },
      },

  };

  assertSemanticFailure(doc, /approve.*next\.cases is missing schema-declared case 'revise'/);
});
