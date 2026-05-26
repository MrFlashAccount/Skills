#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import Ajv2020 from 'ajv/dist/2020.js';
import { _Code } from 'ajv/dist/compile/codegen/code.js';
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

function collectSchemas(dir, baseDir = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectSchemas(entryPath, baseDir);
      if (!entry.isFile() || !entry.name.endsWith('.json')) return [];

      const relativePath = path.relative(baseDir, entryPath);
      const fileName = `${path.join(path.dirname(relativePath), path.basename(entry.name, '.json'))}.mjs`;
      const schema = JSON.parse(readFileSync(entryPath, 'utf8'));
      return [{ fileName, schema, schemaPath: entryPath }];
    });
}

function anonymousFunctionExpression(func) {
  return Function.prototype.toString.call(func)
    .replace(/^function\s+[$A-Z_a-z][$\w]*\s*\(/, 'function (');
}

function inlineStandaloneFunctionScopes(ajv) {
  for (const scopeName of ajv.scope?._values?.func?.values() ?? []) {
    if (typeof scopeName.value?.ref !== 'function') continue;
    scopeName.value.code = new _Code(anonymousFunctionExpression(scopeName.value.ref));
  }
}

async function bundleStandaloneEsm(moduleCode, fileName) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'skills-ajv-standalone-'));
  const entryPath = path.join(tempDir, fileName);
  try {
    mkdirSync(path.dirname(entryPath), { recursive: true });
    writeFileSync(entryPath, moduleCode);

    const result = await build({
      entryPoints: [entryPath],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      legalComments: 'none',
      minify: true,
      logLevel: 'silent',
    });

    return result.outputFiles[0].text;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const schemas = collectSchemas(schemasDir).sort((a, b) => a.fileName.localeCompare(b.fileName));

if (schemas.length === 0) usage(`no JSON schemas found in ${schemasDir}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const { fileName, schema } of schemas) {
  const ajv = new Ajv2020({ code: { esm: true, source: true }, allErrors: true });
  for (const loaded of schemas) ajv.addSchema(loaded.schema);
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  inlineStandaloneFunctionScopes(ajv);
  const rawModuleCode = standaloneCode(ajv, validate);
  const bundledModuleCode = await bundleStandaloneEsm(rawModuleCode, fileName);
  const outputPath = path.join(outDir, fileName);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, bundledModuleCode.endsWith('\n') ? bundledModuleCode : `${bundledModuleCode}\n`);
}

console.log(`generated ${schemas.length} standalone validators in ${path.relative(process.cwd(), outDir) || '.'}`);
