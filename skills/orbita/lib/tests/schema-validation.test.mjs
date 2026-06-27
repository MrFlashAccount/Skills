import assert from 'node:assert/strict';
import test from 'node:test';
import { validateJsonSchema } from '../../../../shared/scripts/schema-validation/schema-validation.mjs';
import reviewJoinOutputSchema from '../../../../workflows/dev-harness/schemas/review-join-output.json' with { type: 'json' };
import reviewerSelectionOutputSchema from '../../../../workflows/dev-harness/schemas/reviewer-selection-output.json' with { type: 'json' };
import { assertBatonSchema, batonSchema } from '../entities/Baton/schema/baton-schema.mjs';
import { assertWorkflowSchema, workflowSchema } from '../file-contracts/workflow-document-schema.mjs';
import runnerHostResponseSchema from '../persistence/run-state/schema/runner-host-response.json' with { type: 'json' };

const runtimeSchemas = [workflowSchema, batonSchema, reviewerSelectionOutputSchema, reviewJoinOutputSchema, runnerHostResponseSchema];

function minimalWorkflowDoc(overrides = {}) {
  return {
    name: 'minimal-workflow',
    version: 1,
    start: 'worker_step',
    done: 'done',
    blocked: 'blocked',
    steps: {
      worker_step: {
        name: 'Worker step',
        kind: 'worker',
        output: { template: 'output.md' },
        next: 'done',
      },
      done: { name: 'Done', kind: 'done' },
      blocked: { name: 'Blocked', kind: 'blocked' },
    },
    ...overrides,
  };
}

test('generic JSON Schema helper validates workflow schema documents at runtime', () => {
  const valid = {
    outcome: 'ready_for_review',
    review_plan: {
      reviewers: [
        {
          role: 'security',
          reason: 'Touches trust boundaries.',
          surfaces: ['auth middleware', 'API request handling'],
          required: true,
        },
      ],
    },
  };

  assert.equal(validateJsonSchema(reviewerSelectionOutputSchema, valid, { schemas: runtimeSchemas }).ok, true);
  assert.equal(validateJsonSchema(reviewerSelectionOutputSchema, {
    ...valid,
    review_plan: { reviewers: [{ ...valid.review_plan.reviewers[0], role: 'staff-backend' }] },
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(reviewerSelectionOutputSchema, {
    ...valid,
    review_plan: { reviewers: [{ ...valid.review_plan.reviewers[0], surfaces: [] }] },
  }, { schemas: runtimeSchemas }).ok, false);
});


test('review join output schema rejects mismatched needs_changes rework routing targets', () => {
  const valid = {
    outcome: 'needs_changes',
    verdict: {
      summary: ['Backend contract needs a fix.'],
      selected_review_steps: ['backend_review'],
      failed_review_steps: ['backend_review'],
      required_implementation_steps: ['backend_implementation'],
    },
    next: ['backend_implementation'],
  };

  assert.equal(validateJsonSchema(reviewJoinOutputSchema, valid, { schemas: runtimeSchemas }).ok, true);
  assert.equal(validateJsonSchema(reviewJoinOutputSchema, {
    ...valid,
    next: ['frontend_implementation'],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(reviewJoinOutputSchema, {
    ...valid,
    verdict: {
      ...valid.verdict,
      required_implementation_steps: ['backend_implementation', 'frontend_implementation'],
    },
  }, { schemas: runtimeSchemas }).ok, false);
});


test('baton schema rejects empty or whitespace-only user_prompt outside CLI', () => {
  const validBaton = {
    cursor: 'worker_step',
    status: 'running',
    state: { artifacts: [], results: [] },
    user_prompt: 'raw startup prompt',
  };

  assert.doesNotThrow(() => assertBatonSchema(validBaton));
  assert.throws(
    () => assertBatonSchema({ ...validBaton, user_prompt: '  \n\t' }),
    /baton failed schema validation: .*user_prompt.*must match pattern|baton failed schema validation: .*must match pattern/,
  );
});

test('workflow schema accepts workflow documents without workflow-level instruction', () => {
  assert.doesNotThrow(() => assertWorkflowSchema(minimalWorkflowDoc()));
});

test('workflow schema permits empty workflow-level instruction values as optional metadata', () => {
  assert.doesNotThrow(() => assertWorkflowSchema(minimalWorkflowDoc({ instruction: '' })));
  assert.doesNotThrow(() => assertWorkflowSchema(minimalWorkflowDoc({ instructions: '  \n\t' })));
});

test('runner host response schema enforces action-conditional reuse hint fields', () => {
  const validRunWorker = {
    status: 'needs_host_actions',
    orchestratorInstruction: 'Execute host requests.',
    baton: {
      cursor: 'worker_step',
      status: 'running',
      state: { artifacts: [], results: [] },
    },
    requests: [
      {
        id: 'worker_step',
        stepId: 'worker_step',
        action: 'run_worker',
        loadInstructionsCommand: 'node workflow-runner.mjs instructions',
        preferredAgentId: null,
        bindAgentCommand: 'node workflow-runner.mjs bind-agent --agent-id <agent-id>',
        loadFollowupInstructionsCommand: 'node workflow-runner.mjs instructions --follow-up',
      },
    ],
  };
  const validApproval = {
    ...validRunWorker,
    requests: [
      {
        id: 'approval_step',
        stepId: 'approval_step',
        action: 'wait_for_approval',
      },
    ],
  };

  assert.equal(validateJsonSchema(runnerHostResponseSchema, validRunWorker, { schemas: runtimeSchemas }).ok, true);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validRunWorker,
    requests: [{ ...validRunWorker.requests[0], preferredAgentId: undefined }],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validRunWorker,
    requests: [{ ...validRunWorker.requests[0], bindAgentCommand: undefined }],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validRunWorker,
    requests: [{ ...validRunWorker.requests[0], loadFollowupInstructionsCommand: undefined }],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validApproval,
    requests: [{ ...validApproval.requests[0], preferredAgentId: null }],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validApproval,
    requests: [{ ...validApproval.requests[0], bindAgentCommand: 'node workflow-runner.mjs bind-agent' }],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validApproval,
    requests: [{ ...validApproval.requests[0], loadFollowupInstructionsCommand: 'node workflow-runner.mjs instructions --follow-up' }],
  }, { schemas: runtimeSchemas }).ok, false);
  assert.equal(validateJsonSchema(runnerHostResponseSchema, {
    ...validRunWorker,
    requests: [{ ...validRunWorker.requests[0], attemptId: 'attempt-1' }],
  }, { schemas: runtimeSchemas }).ok, false);
});
