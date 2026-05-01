#!/usr/bin/env node

/**
 * @fileoverview Check GitHub CLI auth and optional project reachability before write-ready runs.
 */

import { spawnSync } from 'node:child_process';

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {{status:number, stdout:string, stderr:string}}
 */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

const [owner, projectNumber] = process.argv.slice(2);
const auth = run('gh', ['auth', 'status']);

const summary = {
  auth: {
    ok: auth.status === 0,
    stderr: auth.stderr,
    stdout: auth.stdout,
  },
};

if (owner && projectNumber) {
  const project = run('gh', ['project', 'view', String(projectNumber), '--owner', String(owner), '--format', 'json']);
  summary.project = {
    owner,
    number: projectNumber,
    ok: project.status === 0,
    stderr: project.stderr,
    stdout: project.stdout,
  };
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (!summary.auth.ok || (summary.project && !summary.project.ok)) {
  process.exit(1);
}
