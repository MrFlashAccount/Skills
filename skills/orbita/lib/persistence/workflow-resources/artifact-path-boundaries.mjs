import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

function isInsideDirectory(filePath, directory) {
  const rel = relative(directory, filePath);
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

function realPathPreservingMissingTail(pathname) {
  const segments = [];
  let current = resolve(pathname);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return resolve(pathname);
    segments.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync.native(current), ...segments);
}

function isSymlink(pathname) {
  try {
    return lstatSync(pathname).isSymbolicLink();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function artifactPathBoundaryErrors(output, artifactOutputDir) {
  if (artifactOutputDir === undefined || !output || typeof output !== 'object' || Array.isArray(output) || !Object.hasOwn(output, 'artifacts') || !Array.isArray(output.artifacts)) return [];

  const errors = [];
  const expectedDir = resolve(artifactOutputDir);
  const expectedDirIsSymlink = isSymlink(expectedDir);
  const realExpectedDir = expectedDirIsSymlink ? expectedDir : realPathPreservingMissingTail(expectedDir);
  for (const [index, artifact] of output.artifacts.entries()) {
    if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || typeof artifact.path !== 'string' || !isAbsolute(artifact.path)) continue;
    const artifactPath = resolve(artifact.path);
    if (!isInsideDirectory(artifactPath, expectedDir)) {
      errors.push(`/artifacts/${index}/path must be a file under artifact output directory: ${artifactOutputDir}`);
      continue;
    }
    if (expectedDirIsSymlink) {
      errors.push(`/artifacts/${index}/path must use the exact artifact output directory, not a symlink: ${artifactOutputDir}`);
      continue;
    }
    const realArtifactPath = realPathPreservingMissingTail(artifactPath);
    if (!isInsideDirectory(realArtifactPath, realExpectedDir)) errors.push(`/artifacts/${index}/path must not escape artifact output directory through symlinks: ${artifactOutputDir}`);
  }
  return errors;
}
