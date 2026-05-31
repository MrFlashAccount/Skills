import { parseArgs } from 'node:util';
import { preparePersistedRun } from '../use-cases/index.mjs';
import { PersistRunStateFileAdapter } from '../persistence/index.mjs';

const runStateFiles = new PersistRunStateFileAdapter();

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

export async function runCli(argv = process.argv.slice(2)) {
  const values = parseCliArgs(argv);
  const runDir = requireString(values['run-dir'], '--run-dir');
  const responsePath = values.response;
  const batonPath = values.baton;

  if ((responsePath && batonPath) || (!responsePath && !batonPath)) {
    fail('provide exactly one of --response or --baton');
  }

  let payload;
  try {
    const input = await runStateFiles.readInput({ responsePath, batonPath });
    payload = preparePersistedRun({ input, output: values.output, decision: values.decision });
  } catch (error) {
    fail(error.message);
  }

  let persisted;
  try {
    persisted = await runStateFiles.persistRunState({ runDir, ...payload });
  } catch (error) {
    fail(`cannot persist run state in ${runDir}: ${error.message}`);
  }

  console.log(JSON.stringify({ ok: true, baton: persisted.baton, history: persisted.history }));
}
