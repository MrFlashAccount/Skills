#!/usr/bin/env node
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { WorkflowInterpreterError } from '../workflow/errors.mjs';
import { assertBatonSchema, assertResponseSchema } from '../workflow/schema-validation.mjs';

function fail(message) {
  console.error(`persist-run-state: ${message}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        'run-dir': { type: 'string' },
        response: { type: 'string' },
        baton: { type: 'string' },
        output: { type: 'string' },
        decision: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error.message}\nusage: node develop/lib/bin/persist-run-state.mjs --run-dir <dir> (--response <workflow-interpreter-response.json> | --baton <new-baton.json>) [--output <worker-output-path>] [--decision <text>]`);
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
    if (error instanceof WorkflowInterpreterError) fail(error.message);
    throw error;
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

function historyEntry({ baton, steps, source, output, decision }) {
  const lines = [
    `## ${new Date().toISOString()}`,
    '',
    `- source: ${source}`,
    `- baton: cursor=${baton.cursor ?? 'unknown'} status=${baton.status ?? 'unknown'}`,
  ];

  if (steps) lines.push(`- steps: ${steps.map((step) => `id=${step.id ?? 'unknown'} action=${step.action ?? 'unknown'}`).join('; ')}`);
  if (output) lines.push(`- output: ${output}`);
  if (decision) lines.push(`- decision: ${decision}`);
  if (baton.blocker) lines.push(`- blocker: ${compact(JSON.stringify(baton.blocker))}`);

  lines.push('', '');
  return lines.join('\n');
}

async function writeFileAtomic(path, content) {
  const dir = dirname(path);
  const tempPath = join(dir, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  const handle = await open(tempPath, 'wx', 0o600);
  let renamed = false;

  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    await rename(tempPath, path);
    renamed = true;
  } finally {
    try {
      await handle.close();
    } catch {}
    if (!renamed) await rm(tempPath, { force: true });
  }
}

async function appendFileDurably(path, content) {
  const handle = await open(path, 'a', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const values = parseCliArgs(process.argv.slice(2));
const runDir = requireString(values['run-dir'], '--run-dir');
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

await mkdir(runDir, { recursive: true });

const persistedBatonPath = join(runDir, 'baton.json');
const historyPath = join(runDir, 'history.md');
const batonContent = `${JSON.stringify(baton, null, 2)}\n`;
const entry = historyEntry({
  baton,
  steps,
  source: responsePath ? responsePath : batonPath,
  output: compact(values.output),
  decision: compact(values.decision),
});

try {
  await writeFileAtomic(persistedBatonPath, batonContent);
  await appendFileDurably(historyPath, entry);
} catch (error) {
  fail(`cannot persist run state in ${runDir}: ${error.message}`);
}

console.log(JSON.stringify({ ok: true, baton: persistedBatonPath, history: historyPath }));
