import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { readRunArtifactContent } from '../persistence/workflow-resources/runtime-reader.mjs';

const tempDir = mkdtempSync(path.join(tmpdir(), 'runtime-reader-artifacts-'));

after(() => rmSync(tempDir, { recursive: true, force: true }));

function runDir(label) {
  const dir = path.join(tempDir, label);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('readRunArtifactContent reads run-relative artifact content', () => {
  const dir = runDir('valid');
  mkdirSync(path.join(dir, 'worker', 'artifacts'), { recursive: true });
  writeFileSync(path.join(dir, 'worker', 'artifacts', 'packet.md'), 'artifact body\n');

  assert.equal(readRunArtifactContent({ runDir: dir, artifactPath: 'worker/artifacts/packet.md' }), 'artifact body\n');
});

test('readRunArtifactContent fails clearly for missing files', () => {
  const dir = runDir('missing');

  assert.throws(
    () => readRunArtifactContent({ runDir: dir, artifactPath: 'worker/artifacts/missing.md' }),
    /workflow prompt render failed: missing artifact file 'worker\/artifacts\/missing\.md'/,
  );
});

test('readRunArtifactContent reads absolute artifact paths inside the run directory', () => {
  const dir = runDir('absolute');
  mkdirSync(path.join(dir, 'worker', 'artifacts'), { recursive: true });
  const artifactPath = path.join(dir, 'worker', 'artifacts', 'packet.md');
  writeFileSync(artifactPath, 'absolute artifact body\n');

  assert.equal(readRunArtifactContent({ runDir: dir, artifactPath }), 'absolute artifact body\n');
});

test('readRunArtifactContent rejects absolute artifact paths outside the run directory', () => {
  const dir = runDir('absolute-outside');
  const artifactPath = path.join(tempDir, 'outside-absolute.md');
  writeFileSync(artifactPath, 'outside absolute content\n');

  assert.throws(
    () => readRunArtifactContent({ runDir: dir, artifactPath }),
    /workflow prompt render failed: artifact path cannot escape run directory:/,
  );
});

test('readRunArtifactContent rejects parent traversal artifact paths', () => {
  const dir = runDir('traversal');

  assert.throws(
    () => readRunArtifactContent({ runDir: dir, artifactPath: '../outside.md' }),
    /workflow prompt render failed: artifact path cannot escape run directory: \.\.\/outside\.md/,
  );
});

test('readRunArtifactContent rejects symlink escapes outside run directory', () => {
  const dir = runDir('symlink');
  const outsideDir = path.join(tempDir, 'outside');
  mkdirSync(path.join(dir, 'worker', 'artifacts'), { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(path.join(outsideDir, 'secret.md'), 'outside content\n');
  symlinkSync(path.join(outsideDir, 'secret.md'), path.join(dir, 'worker', 'artifacts', 'packet.md'));

  assert.throws(
    () => readRunArtifactContent({ runDir: dir, artifactPath: 'worker/artifacts/packet.md' }),
    /workflow prompt render failed: artifact path cannot escape run directory via symlink: worker\/artifacts\/packet\.md/,
  );
});
