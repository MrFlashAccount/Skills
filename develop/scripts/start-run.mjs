#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, '..');
const defaultWorkflowPath = join(skillDir, 'dev-harness.workflow.json');

function fail(message) {
  console.error(`start-run: ${message}`);
  process.exit(1);
}

function parseCliArgs(argv) {
  try {
    return parseArgs({
      args: argv,
      options: {
        'run-dir': { type: 'string' },
        workflow: { type: 'string' },
        'user-prompt': { type: 'string' },
        'user-prompt-file': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(`${error.message}\nusage: node scripts/start-run.mjs --run-dir <dir> [--workflow <workflow.json>] [--user-prompt <text> | --user-prompt-file <path>]`);
  }
}

function assertUserPromptArgs(values) {
  if (values['user-prompt'] !== undefined && values['user-prompt-file']) fail('provide only one of --user-prompt or --user-prompt-file');
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} is required`);
  return value;
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
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

function workflowStart(workflowDoc, workflowPath) {
  const start = workflowDoc?.workflow?.start;
  if (typeof start !== 'string' || start.length === 0) fail(`workflow missing string workflow.start: ${workflowPath}`);
  return start;
}

async function createFileIfMissing(path, content) {
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

async function resolveUserPrompt(values) {
  if (values['user-prompt'] !== undefined) return values['user-prompt'];
  if (values['user-prompt-file']) return readFile(values['user-prompt-file'], 'utf8');
  return undefined;
}

async function initializeRunFiles(runDir, workflowPath, { userPrompt } = {}) {
  await mkdir(runDir, { recursive: true });

  const batonPath = join(runDir, 'baton.json');
  const historyPath = join(runDir, 'history.md');
  const batonExists = await exists(batonPath);

  if (!batonExists) {
    const workflowDoc = await readJson(workflowPath, 'workflow');
    const initialBaton = {
      cursor: workflowStart(workflowDoc, workflowPath),
      status: 'running',
      state: { artifacts: [], results: [] },
    };
    if (typeof userPrompt === 'string') initialBaton.user_prompt = userPrompt;
    await writeFile(batonPath, `${JSON.stringify(initialBaton, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }

  await createFileIfMissing(historyPath, '');

  return { batonPath, historyPath, resumed: batonExists };
}

function inspectWorkflow(workflowPath, batonPath) {
  const result = spawnSync(process.execPath, [join(scriptDir, 'workflow-interpreter.mjs'), 'inspect', workflowPath, batonPath], {
    cwd: skillDir,
    encoding: 'utf8',
  });

  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`cannot run workflow interpreter: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`workflow interpreter returned invalid JSON: ${error.message}`);
  }
}

const values = parseCliArgs(process.argv.slice(2));
assertUserPromptArgs(values);
const runDir = requireString(values['run-dir'], '--run-dir');
const workflowPath = resolve(values.workflow ?? defaultWorkflowPath);
const resolvedRunDir = resolve(runDir);

const userPrompt = await resolveUserPrompt(values);
const { batonPath, historyPath, resumed } = await initializeRunFiles(resolvedRunDir, workflowPath, { userPrompt });
const response = inspectWorkflow(workflowPath, batonPath);

console.log(JSON.stringify({
  ok: true,
  runDir: resolvedRunDir,
  baton: batonPath,
  history: historyPath,
  initialized: !resumed,
  resumed,
  response,
}, null, 2));
