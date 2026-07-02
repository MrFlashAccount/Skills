#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { startDashboardServer } from '../../dashboard/server/dashboard-server.mjs';
import { publicErrorMessage } from './public-error.mjs';

function fail(message) {
  console.error(`orbita-dashboard: ${publicErrorMessage(message)}`);
  process.exit(1);
}

function usage() {
  return 'usage: node ./lib/entrypoints/cli/orbita-dashboard.mjs serve [--host <host>] [--port <port>] [--runs-root <path>] [--poll-ms <ms>] [--static-root <path>]';
}

function parseCliArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode !== 'serve') fail(usage());
  try {
    const parsed = parseArgs({
      args: rest,
      options: {
        host: { type: 'string', default: '127.0.0.1' },
        port: { type: 'string', default: '0' },
        'runs-root': { type: 'string' },
        'poll-ms': { type: 'string', default: '1000' },
        'static-root': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    return parsed.values;
  } catch (error) {
    fail(`${error.message}\n${usage()}`);
  }
}

try {
  const values = parseCliArgs(process.argv.slice(2));
  const dashboard = await startDashboardServer({
    host: values.host,
    port: Number(values.port),
    runsRoot: values['runs-root'],
    pollMs: Number(values['poll-ms']),
    staticRoot: values['static-root'],
  });
  console.log(JSON.stringify({ url: dashboard.url }, null, 2));
} catch (error) {
  fail(error.message);
}
