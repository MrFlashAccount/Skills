#!/usr/bin/env node

/**
 * @fileoverview Add an issue or PR URL to a GitHub Project.
 */

import { spawnSync } from 'node:child_process';

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

const [owner, projectNumber, contentUrl] = process.argv.slice(2);
if (!owner || !projectNumber || !contentUrl) {
  throw new Error('usage: add-to-project.mjs <owner> <project-number> <issue-or-pr-url>');
}

const result = run('gh', [
  'project',
  'item-add',
  String(projectNumber),
  '--owner',
  String(owner),
  '--url',
  String(contentUrl),
  '--format',
  'json',
]);

process.stdout.write(`${result}\n`);
