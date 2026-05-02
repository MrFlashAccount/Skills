#!/usr/bin/env node

/**
 * @fileoverview Create a GitHub issue from a normalized task contract and a pre-rendered body on stdin.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * @typedef {Object} TaskContract
 * @property {string} title
 * @property {string} repo
 * @property {string[]} [labels]
 */

/**
 * @param {string|undefined} filePath
 * @returns {TaskContract & Record<string, unknown>}
 */
function readContract(filePath) {
  const raw = filePath ? fs.readFileSync(filePath, 'utf8') : fs.readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} failed`);
  }
  return result.stdout.trim();
}

const contract = readContract(process.argv[2]);
const body = fs.readFileSync(0, 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-ticket-intake-'));
const bodyPath = path.join(tempDir, 'issue.md');
fs.writeFileSync(bodyPath, body, 'utf8');

const args = ['issue', 'create', '--repo', String(contract.repo), '--title', String(contract.title), '--body-file', bodyPath];
if (Array.isArray(contract.labels) && contract.labels.length > 0) {
  args.push('--label', contract.labels.join(','));
}

const url = run('gh', args);
process.stdout.write(`${url}\n`);
