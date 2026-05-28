import { build } from 'esbuild';

await build({
  entryPoints: ['shared/scripts/json-schema-validation.source.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'shared/scripts/json-schema-validation.mjs',
  banner: {
    js: [
      '// Generated bundle from shared/scripts/json-schema-validation.source.mjs.',
      '// Commit this artifact so JSON Schema validation works from a fresh clone without npm install/build.',
    ].join('\n'),
  },
});
