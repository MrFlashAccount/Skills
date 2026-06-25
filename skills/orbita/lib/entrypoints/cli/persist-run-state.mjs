#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertBatonSchema } from '../../entities/Baton/schema/baton-schema.mjs';
import { publicErrorMessage } from './public-error.mjs';
import { assertResponseSchema } from '../../use-cases/runtime/output/response-schema.mjs';
import { writePersistedRunStateUpdate } from '../../persistence/run-state/PersistedRunStateWriter.mjs';
import { assertFreshTokenAuthority } from '../../persistence/run-state/lease-authority.mjs';
import { ensureRunFiles, resolveRunPaths } from '../../persistence/run-state/paths.mjs';
import { readRunsIndex, runsIndexPathsForRoot, upsertRunIndexEntry } from '../../persistence/run-state/run-index.mjs';

function fail(message) {
  console.error(`persist-run-state: ${publicErrorMessage(message)}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        'run-id': { type: 'string' },
        'workflow': { type: 'string' },
        response: { type: 'string' },
        baton: { type: 'string' },
        decision: { type: 'string' },
        'lease-token': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error.message}\nusage: node ./lib/entrypoints/cli/persist-run-state.mjs --run-id <id> [--workflow <workflow.json>] (--response <workflow-interpreter-response.json> | --baton <new-baton.json>) [--decision <text>] [--lease-token <token>]`);
  }
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} is required`);
  return value;
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`);
}

function assertPersistSchema(assertFn, value) {
  try {
    assertFn(value);
  } catch (error) {
    fail(error.message);
  }
}

async function readJson(path, name) {
  let content;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    fail(`cannot read ${name} from ${path}: ${error.message}`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    fail(`cannot parse ${name} from ${path}: ${error.message}`);
  }
}

function compact(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value).replace(/\s+/g, ' ').trim();
}

async function resolveIndexedRunPaths({ runId, workflowPath }) {
  const paths = resolveRunPaths({ runId });
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const indexedWorkflowPath = index.runs[runId]?.workflow?.path;
  if (typeof indexedWorkflowPath !== 'string' || indexedWorkflowPath.length === 0) return workflowPath ? resolveRunPaths({ runId, workflowPath }) : paths;
  if (workflowPath && resolve(indexedWorkflowPath) !== resolve(workflowPath)) fail(`workflow run is already bound to a different workflow: ${runId}`);
  return resolveRunPaths({ runId, workflowPath: indexedWorkflowPath });
}

async function assertTokenAuthority(paths, token) {
  const index = await readRunsIndex(runsIndexPathsForRoot(paths.runsRoot));
  const run = index.runs[paths.runId];
  try { assertFreshTokenAuthority(run?.workerLease, token, { runId: paths.runId }); }
  catch (error) { fail(error.message); }
}

function historyPatch({ baton, steps, source, decision }) {
  return {
    baton,
    source,
    decision: compact(decision),
    steps,
  };
}

const values = parseCliArgs(process.argv.slice(2));
const runId = requireString(values['run-id'], '--run-id');
const responsePath = values.response;
const batonPath = values.baton;

if ((responsePath && batonPath) || (!responsePath && !batonPath)) {
  fail('provide exactly one of --response or --baton');
}

const input = responsePath
  ? await readJson(responsePath, 'workflow interpreter response')
  : await readJson(batonPath, 'baton');

if (responsePath) {
  requireObject(input, 'workflow interpreter response');
  assertPersistSchema(assertResponseSchema, input);
} else {
  assertPersistSchema(assertBatonSchema, input);
}
const baton = responsePath ? input.baton : input;
const steps = responsePath ? input.steps : undefined;
requireObject(baton, 'baton');

const paths = await resolveIndexedRunPaths({ runId, workflowPath: values.workflow });
await assertTokenAuthority(paths, values['lease-token']);
await ensureRunFiles(paths);
await upsertRunIndexEntry(paths, { status: 'running', workflowPath: paths.workflowPath });

try {
  await writePersistedRunStateUpdate(paths, {
    baton,
    instructions: [],
    history: historyPatch({
      baton,
      steps,
      source: responsePath ? responsePath : batonPath,
      decision: values.decision,
    }),
  });
} catch (error) {
  fail(`cannot persist run state for ${runId}: ${error.message}`);
}

console.log(JSON.stringify({ ok: true, runId: paths.runId }));
