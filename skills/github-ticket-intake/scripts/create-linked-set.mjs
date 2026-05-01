#!/usr/bin/env node

/**
 * @fileoverview Create a small linked GitHub ticket set from a normalized contract.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { renderIssueBody } from './render-checklist.mjs';

/**
 * @typedef {Object} TicketDraft
 * @property {string} title
 * @property {string} [summary]
 * @property {string} [desiredOutcome]
 * @property {string[]} [inScope]
 * @property {string[]} [outOfScope]
 * @property {string[]} [acceptanceCriteria]
 * @property {string[]} [risks]
 * @property {string[]} [openQuestions]
 * @property {(string|{title:string, done?:boolean})[]} [subtasks]
 * @property {'parent'|'child'|'peer'} [role]
 */

/**
 * @typedef {Object} TicketSetContract
 * @property {string} repo
 * @property {string[]} [labels]
 * @property {TicketDraft[]} issues
 */

/**
 * @param {string|undefined} filePath
 * @returns {TicketSetContract}
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

/**
 * @param {TicketDraft} draft
 * @param {string} relationSection
 * @returns {string}
 */
function renderFullBody(draft, relationSection) {
  const base = renderIssueBody(draft).trimEnd();
  return relationSection ? `${base}\n\n## Related issues\n${relationSection}\n` : `${base}\n`;
}

/**
 * @param {{title:string,url:string,role?:string}[]} created
 * @param {number} index
 * @returns {string}
 */
function buildRelationSection(created, index) {
  const current = created[index];
  const parentIndex = created.findIndex((entry) => entry.role === 'parent');

  if (current.role === 'parent') {
    const children = created.filter((entry, childIndex) => childIndex !== index);
    if (children.length === 0) {
      return '';
    }
    return children.map((entry) => `- Child: [${entry.title}](${entry.url})`).join('\n');
  }

  if (parentIndex >= 0) {
    return `- Parent: [${created[parentIndex].title}](${created[parentIndex].url})`;
  }

  const siblings = created.filter((entry, siblingIndex) => siblingIndex !== index);
  return siblings.map((entry) => `- Related: [${entry.title}](${entry.url})`).join('\n');
}

const dryRun = process.argv.includes('--dry-run');
const contractArg = process.argv.slice(2).find((arg) => arg !== '--dry-run');
const contract = readContract(contractArg);
if (!Array.isArray(contract.issues) || contract.issues.length < 2) {
  throw new Error('create-linked-set.mjs expects at least 2 issues');
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-ticket-intake-set-'));
const created = [];

for (let index = 0; index < contract.issues.length; index += 1) {
  const issue = contract.issues[index];
  const bodyPath = path.join(tempDir, `issue-${index + 1}.md`);
  fs.writeFileSync(bodyPath, renderFullBody(issue, ''), 'utf8');

  if (dryRun) {
    const fakeUrl = `https://example.invalid/${contract.repo}/issues/${index + 1}`;
    created.push({ title: issue.title, url: fakeUrl, role: issue.role || 'peer' });
    continue;
  }

  const args = ['issue', 'create', '--repo', String(contract.repo), '--title', String(issue.title), '--body-file', bodyPath];
  if (Array.isArray(contract.labels) && contract.labels.length > 0) {
    args.push('--label', contract.labels.join(','));
  }

  const url = run('gh', args);
  created.push({ title: issue.title, url, role: issue.role || 'peer' });
}

const output = [];
for (let index = 0; index < contract.issues.length; index += 1) {
  const issue = contract.issues[index];
  const relationSection = buildRelationSection(created, index);
  const bodyPath = path.join(tempDir, `issue-${index + 1}-linked.md`);
  const fullBody = renderFullBody(issue, relationSection);
  fs.writeFileSync(bodyPath, fullBody, 'utf8');

  if (!dryRun) {
    const issueNumber = created[index].url.split('/').pop();
    run('gh', ['issue', 'edit', String(issueNumber), '--repo', String(contract.repo), '--body-file', bodyPath]);
  }

  output.push({ ...created[index], body: fullBody });
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
