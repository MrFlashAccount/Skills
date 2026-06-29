import assert from 'node:assert/strict';
import test from 'node:test';
import { renderStepInstructionsForStep } from './pipeline.mjs';

test('approval instruction renderer emits exact artifact choice protocol', () => {
  const actual = renderStepInstructionsForStep({
    id: 'approve_design',
    action: 'wait_for_approval',
    step: {
      name: 'Approve Workflow Design',
      input: { prompt: 'Approve the proposed workflow design.' },
      next: { match: '${{ output.approval }}', cases: { approved: 'done', rejected: 'revise', blocked: 'blocked' } },
    },
    approvalPrompt: {
      artifacts: [
        {
          label: "Projected artifact 'proposal' from 'design'",
          path: '/runs/design/artifacts/proposal.md',
          contentType: 'text/markdown',
        },
      ],
      summaries: [
        { sourceStepId: 'critic', kind: 'result', summary: 'approved with one follow-up' },
      ],
    },
  }, {
    request: {
      resolvedOutputSchema: {
        schema: {
          type: 'object',
          required: ['approval'],
          properties: {
            approval: { enum: ['approved', 'rejected', 'blocked'] },
            blocker: { type: 'object' },
          },
        },
      },
    },
    commands: { writeOutputCommand: "node workflow-runner.mjs write-output --step-id approve_design <<'JSON'\n<paste strict JSON here>\nJSON" },
  });

  assert.equal(actual, `Approval request: approve_design

Do exactly:

Attach these artifacts before asking the user:
- Projected artifact 'proposal' from 'design' (text/markdown): /runs/design/artifacts/proposal.md

If an artifact cannot be attached or linked, say so in the user message and include its path.

Render this message to the user as the final message:

<message>
**Approve Workflow Design**

Context:
- Approve the proposed workflow design.
- critic result: approved with one follow-up
- Attached artifact: Projected artifact 'proposal' from 'design'

Choose one:
- approved
- rejected
- blocked
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}
- rejected -> {"approval":"rejected"}
- blocked -> {"approval":"blocked","blocker":{"reason":"..."}}

Submit with:

node workflow-runner.mjs write-output --step-id approve_design <<'JSON'
<paste strict JSON here>
JSON`);
});

test('approval instruction renderer emits exact free-form schema protocol', () => {
  const actual = renderStepInstructionsForStep({
    id: 'capture_answer',
    action: 'wait_for_approval',
    step: {
      name: 'Capture Answer',
      input: { prompt: 'Ask the user for the rollout note.' },
      next: 'done',
    },
    approvalPrompt: {},
  }, {
    request: {
      resolvedOutputSchema: {
        schema: {
          type: 'object',
          required: ['answer'],
          properties: {
            answer: { type: 'string', description: 'Free-form user answer.' },
          },
          additionalProperties: false,
        },
      },
    },
    commands: { writeOutputCommand: "node workflow-runner.mjs write-output --step-id capture_answer <<'JSON'\n<paste strict JSON here>\nJSON" },
  });

  assert.equal(actual, `Approval request: capture_answer

Do exactly:

Render this message to the user as the final message:

<message>
**Capture Answer**

Context:
- Ask the user for the rollout note.

Provide the requested input.
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Use the user's response to fill JSON matching this schema:

\`\`\`json
{
  "type": "object",
  "required": [
    "answer"
  ],
  "properties": {
    "answer": {
      "type": "string",
      "description": "Free-form user answer."
    }
  },
  "additionalProperties": false
}
\`\`\`

Submit with:

node workflow-runner.mjs write-output --step-id capture_answer <<'JSON'
<paste strict JSON here>
JSON`);
});

test('approval instruction renderer prefers transition choices over incidental schema enums', () => {
  const actual = renderStepInstructionsForStep({
    id: 'approve_risk',
    action: 'wait_for_approval',
    step: {
      name: 'Approve Risk',
      input: { prompt: 'Approve the risk decision.' },
      next: { match: '${{ output.approval }}', cases: { approved: 'done', rejected: 'revise' } },
    },
    approvalPrompt: {},
  }, {
    request: {
      resolvedOutputSchema: {
        schema: {
          type: 'object',
          required: ['risk', 'approval'],
          properties: {
            risk: { enum: ['low', 'high'] },
            approval: { enum: ['approved', 'rejected'] },
          },
          additionalProperties: false,
        },
      },
    },
    commands: { writeOutputCommand: "node workflow-runner.mjs write-output --step-id approve_risk <<'JSON'\n<paste strict JSON here>\nJSON" },
  });

  assert.match(actual, /Choose one:\n- approved\n- rejected/);
  assert.doesNotMatch(actual, /Choose one:\n- low\n- high/);
  assert.match(actual, /- approved -> \{"risk":"low","approval":"approved"\}/);
  assert.match(actual, /- rejected -> \{"risk":"low","approval":"rejected"\}/);
});

test('approval instruction renderer emits exact template-backed user message', () => {
  const actual = renderStepInstructionsForStep({
    id: 'approve_brief',
    action: 'wait_for_approval',
    step: {
      name: 'Approve Brief',
      input: {
        template: 'approval-message.md',
        prompt: 'Make the final call.',
      },
      next: { match: '${{ output.approval }}', cases: { approved: 'done', blocked: 'blocked' } },
    },
    approvalPrompt: {
      promptLayer: '# Approval Brief\n\nReview the risk note before deciding.',
      workflowInstruction: 'Keep workflow-level context visible.',
    },
  }, {
    commands: { writeOutputCommand: "node workflow-runner.mjs write-output --step-id approve_brief <<'JSON'\n<paste strict JSON here>\nJSON" },
  });

  assert.equal(actual, `Approval request: approve_brief

Do exactly:

Render this message to the user as the final message:

<message>
**Approve Brief**

# Approval Brief

Review the risk note before deciding.

Workflow context:
Keep workflow-level context visible.

Context:
- Make the final call.

Choose one:
- approved
- blocked
</message>

Normalize the user's answer to strict JSON that satisfies the output schema.
Known choices:
- approved -> {"approval":"approved"}
- blocked -> {"approval":"blocked"}

Submit with:

node workflow-runner.mjs write-output --step-id approve_brief <<'JSON'
<paste strict JSON here>
JSON`);
});
