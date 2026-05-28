import { build } from 'esbuild';

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
  outfile: 'shared/scripts/schema-validation/vendor/ajv.mjs',
  banner: {
    js: [
      '// Generated vendor bundle for Ajv 2020.',
      '// Commit this artifact so schema-validation works from a fresh clone without npm install/build.',
    ].join('\n'),
  },
});
