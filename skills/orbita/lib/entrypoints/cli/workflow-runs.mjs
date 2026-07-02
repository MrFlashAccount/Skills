#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { claimWorkflowRun, heartbeatWorkflowRun, listWorkflowRuns, registerWorkflowRun, summarizeWorkflowRuns } from '../workflow-runs-api.mjs';
import { publicErrorMessage } from '../../public-error.mjs';


function fail(message) {
  console.error(`workflow-runs: ${publicErrorMessage(message)}`);
  process.exit(1);
}

function usage() {
  return 'usage: node ./lib/entrypoints/cli/workflow-runs.mjs list [--human] | create [--claim] [--run-id <id>] [--workflow <workflow.json>] [--workflow-identity <identity>] [--title <title>] [--summary <summary>] [--task-key <key>] [--task-fingerprint <fingerprint>] [--lease-token <token> + diagnostics metadata] | claim --run-id <id> [--workflow <workflow.json>] [--takeover] [--print-lease-token] [--lease-token <token> + diagnostics metadata] | heartbeat --run-id <id> [--workflow <workflow.json>] [--lease-token <token> + diagnostics metadata]';
}

const options = {
  'run-id': { type: 'string' },
  workflow: { type: 'string' },
  'workflow-identity': { type: 'string' },
  title: { type: 'string' },
  summary: { type: 'string' },
  'task-key': { type: 'string' },
  'task-fingerprint': { type: 'string' },
  owner: { type: 'string' },
  harness: { type: 'string' },
  'session-id': { type: 'string' },
  'worker-id': { type: 'string' },
  'lease-token': { type: 'string' },
  'lease-ms': { type: 'string' },
  'print-lease-token': { type: 'boolean', default: false },
  takeover: { type: 'boolean', default: false },
  claim: { type: 'boolean', default: false },
  human: { type: 'boolean', default: false },
};

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (!['list', 'create', 'claim', 'heartbeat'].includes(mode)) fail(usage());
  try {
    const parsed = parseArgs({ args: rest, options, strict: true, allowPositionals: false });
    if (mode === 'list') {
      const allowed = new Set(['human']);
      for (const key of Object.keys(parsed.values)) if (!allowed.has(key) && parsed.values[key] !== false) fail(usage());
    }
    if ((mode === 'claim' || mode === 'heartbeat') && !parsed.values['run-id']) fail(usage());
    if (mode !== 'claim' && parsed.values.takeover) fail(usage());
    if (mode !== 'claim' && parsed.values['print-lease-token']) fail(usage());
    if ((mode === 'claim' || mode === 'heartbeat') && (parsed.values.title || parsed.values.summary || parsed.values['task-key'] || parsed.values['task-fingerprint'] || parsed.values['workflow-identity'] || parsed.values.claim)) fail(usage());
    return { mode, values: parsed.values };
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

function leaseArgs(values) {
  return {
    owner: values.owner,
    harness: values.harness,
    sessionId: values['session-id'],
    workerId: values['worker-id'],
    takeover: values.takeover,
    leaseToken: values['lease-token'],
    leaseMs: values['lease-ms'] === undefined ? undefined : Number(values['lease-ms']),
  };
}

try {
  const { mode, values } = parseCliArgs(process.argv.slice(2));
  if (mode === 'list') {
    const runs = await listWorkflowRuns();
    process.stdout.write(values.human ? `${summarizeWorkflowRuns(runs)}\n` : `${JSON.stringify(runs, null, 2)}\n`);
  } else if (mode === 'create') {
    const response = await registerWorkflowRun({
      runId: values['run-id'],
      workflowPath: values.workflow,
      workflowIdentity: values['workflow-identity'],
      title: values.title,
      summary: values.summary,
      taskKey: values['task-key'],
      taskFingerprint: values['task-fingerprint'],
      claim: values.claim,
      ...leaseArgs(values),
    });
    console.log(JSON.stringify(response, null, 2));
  } else {
    const leaseAction = mode === 'heartbeat' ? heartbeatWorkflowRun : claimWorkflowRun;
    const response = await leaseAction({
      runId: values['run-id'],
      workflowPath: values.workflow,
      ...leaseArgs(values),
    });
    if (mode === 'claim' && values['print-lease-token']) {
      if (!response.ok) fail(`claim failed: ${response.reason ?? 'unknown reason'}`);
      if (!response.leaseToken) fail('claim did not return a lease token');
      process.stdout.write(`${response.leaseToken}\n`);
    } else {
      console.log(JSON.stringify(response, null, 2));
      if (!response.ok) process.exit(2);
    }
  }
} catch (error) {
  fail(error.message);
}
