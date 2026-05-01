#!/usr/bin/env node

/**
 * @fileoverview Render a GitHub issue body from a normalized task contract.
 */

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {Object} TaskContract
 * @property {string} title
 * @property {string} [summary]
 * @property {string} [desiredOutcome]
 * @property {string[]} [inScope]
 * @property {string[]} [outOfScope]
 * @property {string[]} [acceptanceCriteria]
 * @property {string[]} [risks]
 * @property {string[]} [openQuestions]
 * @property {(string|{title:string, done?:boolean})[]} [subtasks]
 */

/**
 * Read JSON from a file path or stdin.
 * @param {string|undefined} filePath
 * @returns {TaskContract}
 */
function readContract(filePath) {
  const raw = filePath ? fs.readFileSync(filePath, 'utf8') : fs.readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

/**
 * Render markdown bullet lines.
 * @param {string[]|undefined} items
 * @returns {string}
 */
function renderBullets(items) {
  if (!items || items.length === 0) {
    return '- none';
  }

  return items.map((item) => `- ${item}`).join('\n');
}

/**
 * Render markdown checklist lines.
 * @param {(string|{title:string, done?:boolean})[]|undefined} subtasks
 * @returns {string}
 */
function renderChecklist(subtasks) {
  if (!subtasks || subtasks.length === 0) {
    return '- [ ] add subtasks';
  }

  return subtasks
    .map((item) => {
      if (typeof item === 'string') {
        return `- [ ] ${item}`;
      }

      return `- [${item.done ? 'x' : ' '}] ${item.title}`;
    })
    .join('\n');
}

/**
 * Render the final issue markdown body.
 * @param {TaskContract} contract
 * @returns {string}
 */
export function renderIssueBody(contract) {
  return [
    '## Summary',
    contract.summary || contract.title,
    '',
    '## Desired outcome',
    contract.desiredOutcome || 'TBD',
    '',
    '## In scope',
    renderBullets(contract.inScope),
    '',
    '## Out of scope',
    renderBullets(contract.outOfScope),
    '',
    '## Acceptance criteria',
    renderBullets(contract.acceptanceCriteria),
    '',
    '## Risks / open questions',
    renderBullets([...(contract.risks || []), ...(contract.openQuestions || [])]),
    '',
    '## Checklist',
    renderChecklist(contract.subtasks),
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contract = readContract(process.argv[2]);
  process.stdout.write(renderIssueBody(contract));
}
