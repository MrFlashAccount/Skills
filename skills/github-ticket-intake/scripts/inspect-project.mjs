#!/usr/bin/env node

/**
 * @fileoverview Inspect a GitHub Project and print the fields and status options needed by the intake workflow.
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

const [owner, projectNumber] = process.argv.slice(2);
if (!owner || !projectNumber) {
  throw new Error('usage: inspect-project.mjs <owner> <project-number>');
}

const project = JSON.parse(run('gh', ['project', 'view', String(projectNumber), '--owner', String(owner), '--format', 'json']));
const fields = JSON.parse(run('gh', ['project', 'field-list', String(projectNumber), '--owner', String(owner), '--format', 'json']));

const summary = {
  project: {
    id: project.id,
    title: project.title,
    number: project.number,
    owner,
  },
  fields: fields.map((field) => ({
    id: field.id,
    name: field.name,
    type: field.dataType,
    options: (field.options || []).map((option) => ({ id: option.id, name: option.name })),
  })),
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
