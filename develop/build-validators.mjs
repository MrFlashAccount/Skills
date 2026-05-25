#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root = process.cwd();
const outDir = path.join(root, 'develop/dist');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const schemas = [
  ['validate-baton.mjs', 'develop/schemas/baton.json'],
  ['validate-workflow.mjs', 'develop/schemas/workflow.json'],
  ['validate-worker-output.mjs', 'develop/schemas/worker-output.json'],
  ['validate-workflow-interpreter-response.mjs', 'develop/schemas/workflow-interpreter-response.json'],
];

const loadedSchemas = Object.fromEntries(
  schemas.map(([fileName, schemaPath]) => [fileName, JSON.parse(readFileSync(path.join(root, schemaPath), 'utf8'))]),
);

for (const [fileName] of schemas) {
  const ajv = new Ajv2020({ code: { esm: true, source: true }, allErrors: true });
  for (const schema of Object.values(loadedSchemas)) ajv.addSchema(schema);
  const validate = ajv.getSchema(loadedSchemas[fileName].$id) ?? ajv.compile(loadedSchemas[fileName]);
  const moduleCode = standaloneCode(ajv, validate);
  writeFileSync(path.join(outDir, fileName), `${moduleCode}\n`);
}

console.log(`generated ${schemas.length} standalone validators in develop/dist`);
