#!/usr/bin/env node

/**
 * @fileoverview Inspect a GitHub Project and print the fields and status options needed by the intake workflow.
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

/**
 * @param {unknown} payload
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeProjectFieldsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.fields)) {
    return payload.fields;
  }

  throw new Error('unsupported gh project field-list JSON shape: expected an array or an object with fields[]');
}

/**
 * @param {{ id?: string, title?: string, number?: number }} project
 * @param {string} owner
 * @param {unknown} fieldsPayload
 */
export function buildSummary(project, owner, fieldsPayload) {
  const fields = normalizeProjectFieldsPayload(fieldsPayload);

  return {
    project: {
      id: project.id,
      title: project.title,
      number: project.number,
      owner,
    },
    fields: fields.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      options: (field.options || []).map((option) => ({ id: option.id, name: option.name })),
    })),
  };
}

function main() {
  const [owner, projectNumber] = process.argv.slice(2);
  if (!owner || !projectNumber) {
    throw new Error('usage: inspect-project.mjs <owner> <project-number>');
  }

  const project = JSON.parse(run('gh', ['project', 'view', String(projectNumber), '--owner', String(owner), '--format', 'json']));
  const fieldsPayload = JSON.parse(run('gh', ['project', 'field-list', String(projectNumber), '--owner', String(owner), '--format', 'json']));
  const summary = buildSummary(project, owner, fieldsPayload);

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
