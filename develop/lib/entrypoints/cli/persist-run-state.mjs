#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { assertBatonSchema } from '../../entities/Baton/schema/baton-schema.mjs';
import { assertResponseSchema } from '../../use-cases/runtime/output/response-schema.mjs';
import { writePersistedRunStateUpdate } from '../../persistence/run-state/PersistedRunStateWriter.mjs';
import { ensureRunFiles, resolveRunPaths } from '../../persistence/run-state/paths.mjs';
import { upsertRunIndexEntry } from '../../persistence/run-state/run-index.mjs';

function fail(message) {
  console.error(`persist-run-state: ${message}`);
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
        output: { type: 'string' },
        decision: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error.message}\nusage: node develop/lib/entrypoints/cli/persist-run-state.mjs --run-id <id> [--workflow <workflow.json>] (--response <workflow-interpreter-response.json> | --baton <new-baton.json>) [--output <worker-output-path>] [--decision <text>]`);
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

function historyPatch({ baton, steps, source, output, decision }) {
  return {
    baton,
    source,
    output: compact(output),
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

const paths = resolveRunPaths({ runId, workflowPath: values.workflow });
await mkdir(paths.runDir, { recursive: true });
await mkdir(paths.runnerDir, { recursive: true });
await mkdir(paths.instructionsDir, { recursive: true });
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
      output: values.output,
      decision: values.decision,
    }),
  });
} catch (error) {
  fail(`cannot persist run state for ${runId}: ${error.message}`);
}

console.log(JSON.stringify({ ok: true, baton: paths.batonPath, history: paths.historyPath }));
