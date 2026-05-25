#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root = process.cwd();
const outDir = path.join(root, 'develop/dist');
mkdirSync(outDir, { recursive: true });

const schemas = [
  ['validate-baton.mjs', 'develop/dev-harness.baton.schema.json'],
  ['validate-workflow.mjs', 'develop/schemas/workflow.schema.json'],
  ['validate-worker-output.mjs', 'develop/schemas/worker-output.schema.json'],
  ['validate-transition-response.mjs', 'develop/schemas/transition-response.schema.json'],
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
