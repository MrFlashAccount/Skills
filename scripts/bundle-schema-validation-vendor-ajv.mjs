import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outfile = 'shared/scripts/schema-validation/vendor/ajv.mjs';

const normalizeBundledModulePaths = (bundle) =>
  bundle
    .replaceAll(/(?<=\/\/ )(?:(?:\.\.\/)+)?node_modules\//g, 'node_modules/')
    .replaceAll(/(?<=")(?:(?:\.\.\/)+)?node_modules\//g, 'node_modules/');

await build({
  stdin: {
    contents: "export { default } from 'ajv/dist/2020.js';",
    resolveDir: process.cwd(),
    sourcefile: 'schema-validation-vendor-ajv-entry.mjs',
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  banner: {
    js: [
      '// Generated vendor bundle for Ajv 2020.',
      '// Commit this artifact so schema-validation works from a fresh clone without npm install/build.',
    ].join('\n'),
  },
});

const bundle = await readFile(outfile, 'utf8');
await writeFile(outfile, normalizeBundledModulePaths(bundle));
