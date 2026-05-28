import { build } from 'esbuild';

await build({
  entryPoints: ['shared/scripts/schema-validation/internal/bundle-entry.mjs'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'shared/scripts/schema-validation/dist/schema-validation.mjs',
  banner: {
    js: [
      '// Generated bundle from shared/scripts/schema-validation/internal/bundle-entry.mjs.',
      '// Commit this artifact so JSON Schema validation works from a fresh clone without npm install/build.',
    ].join('\n'),
  },
});
