#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

function usage(message) {
  if (message) console.error(message);
  const script = path.relative(process.cwd(), fileURLToPath(import.meta.url));
  console.error(`usage: node ${script} --schemas <dir> --out <dir>`);
  process.exit(message ? 1 : 0);
}

function normalizeStringOptionValues(argv) {
  const normalized = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--schemas' || arg === '--out') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      normalized.push(`${arg}=${argv[i + 1]}`);
      i += 1;
    } else {
      normalized.push(arg);
    }
  }
  return normalized;
}

function parseCliArgs(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: normalizeStringOptionValues(argv),
      options: {
        schemas: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    usage(error.message);
  }

  if (values.help) usage();
  if (!values.schemas) usage('missing required argument: --schemas <dir>');
  if (!values.out) usage('missing required argument: --out <dir>');
  return values;
}

const args = parseCliArgs(process.argv.slice(2));
const schemasDir = path.resolve(process.cwd(), args.schemas);
const outDir = path.resolve(process.cwd(), args.out);

const schemas = readdirSync(schemasDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => {
    const schemaPath = path.join(schemasDir, entry.name);
    const fileName = `${path.basename(entry.name, '.json')}.mjs`;
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    return { fileName, schema, schemaPath };
  })
  .sort((a, b) => a.fileName.localeCompare(b.fileName));

if (schemas.length === 0) usage(`no JSON schemas found in ${schemasDir}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const { fileName, schema } of schemas) {
  const ajv = new Ajv2020({ code: { esm: true, source: true }, allErrors: true });
  for (const loaded of schemas) ajv.addSchema(loaded.schema);
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const moduleCode = standaloneCode(ajv, validate);
  writeFileSync(path.join(outDir, fileName), `${moduleCode}\n`);
}

console.log(`generated ${schemas.length} standalone validators in ${path.relative(process.cwd(), outDir) || '.'}`);
