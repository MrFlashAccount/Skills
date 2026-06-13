#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  cancelWorkflowGatekeeper,
  gateWorkflow,
  listWorkflowGatekeepers,
  resumeWorkflowGatekeeper,
  startWorkflowGatekeeper,
  statusWorkflowGatekeeper,
} from '../api/workflowGatekeeper.mjs';
import { publicErrorMessage } from './public-error.mjs';

function fail(message) {
  console.error(`workflow-gatekeeper: ${publicErrorMessage(message)}`);
  process.exit(1);
}

function usage() {
  return 'usage: node develop/lib/entrypoints/cli/workflow-gatekeeper.mjs start [--workflow-id <id>] [--kind <kind>] [--session-key <key>] [--goal <text>] [--runs-root <dir>] | gate --workflow-id <id> [--gate-id <id>] [--gate-kind <kind>] --human-text <text> --resume-instruction <text> [--choices <json-array>] [--approval-tokens <json-array>] [--expires-at <iso>] [--runs-root <dir>] | list [--state <state>] [--kind <kind>] [--session-key <key>] [--limit <n>] [--runs-root <dir>] | status --workflow-id <id> [--runs-root <dir>] | resume --workflow-id <id> [--gate-id <id>] --answer <text> [--runs-root <dir>] | cancel --workflow-id <id> [--reason <text>] [--runs-root <dir>]';
}

const options = {
  'workflow-id': { type: 'string' },
  'gate-id': { type: 'string' },
  kind: { type: 'string' },
  'gate-kind': { type: 'string' },
  'session-key': { type: 'string' },
  goal: { type: 'string' },
  state: { type: 'string' },
  limit: { type: 'string' },
  'human-text': { type: 'string' },
  'resume-instruction': { type: 'string' },
  choices: { type: 'string' },
  'approval-tokens': { type: 'string' },
  'expires-at': { type: 'string' },
  answer: { type: 'string' },
  reason: { type: 'string' },
  'runs-root': { type: 'string' },
};

function parseJsonArray(value, name) {
  if (value === undefined) return undefined;
  let parsed;
  try { parsed = JSON.parse(value); }
  catch (error) { fail(`${name} must be a JSON array: ${error.message}`); }
  if (!Array.isArray(parsed)) fail(`${name} must be a JSON array`);
  return parsed;
}

function rejectUnexpected(mode, values) {
  const allowedByMode = {
    start: new Set(['workflow-id', 'kind', 'session-key', 'goal', 'runs-root']),
    gate: new Set(['workflow-id', 'gate-id', 'gate-kind', 'human-text', 'resume-instruction', 'choices', 'approval-tokens', 'expires-at', 'runs-root']),
    list: new Set(['state', 'kind', 'session-key', 'limit', 'runs-root']),
    status: new Set(['workflow-id', 'runs-root']),
    resume: new Set(['workflow-id', 'gate-id', 'answer', 'runs-root']),
    cancel: new Set(['workflow-id', 'reason', 'runs-root']),
  };
  for (const key of Object.keys(values)) if (!allowedByMode[mode].has(key) && values[key] !== undefined) fail(usage());
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['start', 'gate', 'list', 'status', 'resume', 'cancel'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({ args: rest, options, strict: true, allowPositionals: false });
    const values = parsed.values;
    rejectUnexpected(mode, values);
    if (['gate', 'status', 'resume', 'cancel'].includes(mode) && !values['workflow-id']) fail(usage());
    if (mode === 'gate' && (!values['human-text'] || !values['resume-instruction'])) fail(usage());
    if (mode === 'resume' && values.answer === undefined) fail(usage());
    return { mode, values };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

try {
  const { mode, values } = parseCliArgs(process.argv.slice(2));
  let response;
  if (mode === 'start') {
    response = await startWorkflowGatekeeper({
      workflowId: values['workflow-id'],
      kind: values.kind,
      sessionKey: values['session-key'],
      goal: values.goal,
      runsRoot: values['runs-root'],
    });
  } else if (mode === 'gate') {
    response = await gateWorkflow({
      workflowId: values['workflow-id'],
      gateId: values['gate-id'],
      gateKind: values['gate-kind'],
      humanText: values['human-text'],
      resumeInstruction: values['resume-instruction'],
      choices: parseJsonArray(values.choices, '--choices'),
      approvalTokens: parseJsonArray(values['approval-tokens'], '--approval-tokens'),
      expiresAt: values['expires-at'],
      runsRoot: values['runs-root'],
    });
  } else if (mode === 'list') {
    response = await listWorkflowGatekeepers({
      state: values.state,
      kind: values.kind,
      sessionKey: values['session-key'],
      limit: values.limit === undefined ? undefined : Number(values.limit),
      runsRoot: values['runs-root'],
    });
  } else if (mode === 'status') {
    response = await statusWorkflowGatekeeper({ workflowId: values['workflow-id'], runsRoot: values['runs-root'] });
  } else if (mode === 'resume') {
    response = await resumeWorkflowGatekeeper({ workflowId: values['workflow-id'], gateId: values['gate-id'], answer: values.answer, runsRoot: values['runs-root'] });
  } else {
    response = await cancelWorkflowGatekeeper({ workflowId: values['workflow-id'], reason: values.reason, runsRoot: values['runs-root'] });
  }
  console.log(JSON.stringify(response, null, 2));
} catch (error) {
  fail(error.message);
}
