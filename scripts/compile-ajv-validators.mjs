#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
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

const schemas = collectSchemas(schemasDir).sort((a, b) => a.fileName.localeCompare(b.fileName));

const ajvRuntimePathPattern = /^ajv\/dist\/runtime\/(?<helper>[A-Za-z0-9_-]+)(?:\.js)?$/;

const bundleAjvRuntimePlugin = {
  name: 'bundle-ajv-runtime',
  setup(buildContext) {
    buildContext.onResolve({ filter: ajvRuntimePathPattern }, (args) => {
      const helper = args.path.match(ajvRuntimePathPattern)?.groups?.helper;
      return { path: helper, namespace: 'ajv-runtime' };
    });

    buildContext.onLoad({ filter: /.*/, namespace: 'ajv-runtime' }, (args) => {
      if (args.path !== 'ucs2length') throw new Error(`unsupported AJV runtime helper: ${args.path}`);
      return {
        loader: 'js',
        contents: `export default function unicodeLength(str) {
  let length = str.length;
  let result = 0;
  let pos = 0;
  let value;
  while (pos < length) {
    result += 1;
    value = str.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff && pos < length) {
      value = str.charCodeAt(pos);
      if ((value & 0xfc00) === 0xdc00) pos += 1;
    }
  }
  return result;
}`,
      };
    });
  },
};

async function bundleStandaloneEsm(moduleCode, fileName) {
  const result = await build({
    stdin: {
      contents: moduleCode,
      loader: 'js',
      resolveDir: process.cwd(),
      sourcefile: fileName,
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
    minify: true,
    plugins: [bundleAjvRuntimePlugin],
    logLevel: 'silent',
  });

  return result.outputFiles[0].text;
}

if (schemas.length === 0) usage(`no JSON schemas found in ${schemasDir}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const { fileName, schema } of schemas) {
  const ajv = new Ajv2020({ code: { esm: true, source: true }, allErrors: true });
  for (const loaded of schemas) ajv.addSchema(loaded.schema);
  const validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const rawModuleCode = standaloneCode(ajv, validate);
  const bundledModuleCode = await bundleStandaloneEsm(rawModuleCode, fileName);
  const outputPath = path.join(outDir, fileName);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, bundledModuleCode.endsWith('\n') ? bundledModuleCode : `${bundledModuleCode}\n`);
}

console.log(`generated ${schemas.length} standalone validators in ${path.relative(process.cwd(), outDir) || '.'}`);
