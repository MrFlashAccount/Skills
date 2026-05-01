#!/usr/bin/env node

/**
 * @fileoverview Render a GitHub issue body from a normalized task contract.
 */

import fs from 'node:fs';
import path from 'node:path';
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
 * @property {string} [template]
 */

const templatesDir = path.resolve(import.meta.dirname, '../templates');
const defaultTemplateName = 'default';

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
 * @returns {string[]}
 */
export function listTemplates() {
  return fs
    .readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

/**
 * @param {string|undefined} name
 * @returns {string}
 */
function resolveTemplateName(name) {
  if (!name) {
    return defaultTemplateName;
  }

  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    throw new Error(`Invalid template name: ${name}`);
  }

  return name;
}

/**
 * @param {string|undefined} name
 * @returns {string}
 */
function loadTemplate(name) {
  const templateName = resolveTemplateName(name);
  const templatePath = path.join(templatesDir, `${templateName}.md`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Unknown template "${templateName}". Available templates: ${listTemplates().join(', ')}`);
  }

  return fs.readFileSync(templatePath, 'utf8');
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
 * @param {TaskContract} contract
 * @returns {Record<string, string>}
 */
function buildTemplateValues(contract) {
  return {
    title: contract.title,
    summary: contract.summary || contract.title,
    desiredOutcome: contract.desiredOutcome || 'TBD',
    inScope: renderBullets(contract.inScope),
    outOfScope: renderBullets(contract.outOfScope),
    acceptanceCriteria: renderBullets(contract.acceptanceCriteria),
    risksOpenQuestions: renderBullets([...(contract.risks || []), ...(contract.openQuestions || [])]),
    checklist: renderChecklist(contract.subtasks),
  };
}

/**
 * Render the final issue markdown body from a named markdown template.
 * @param {TaskContract} contract
 * @returns {string}
 */
export function renderIssueBody(contract) {
  const template = loadTemplate(contract.template);
  const values = buildTemplateValues(contract);

  return `${template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (match, key) => {
    if (!(key in values)) {
      throw new Error(`Unknown template placeholder: ${match}`);
    }
    return values[key];
  }).trimEnd()}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contract = readContract(process.argv[2]);
  process.stdout.write(renderIssueBody(contract));
}
