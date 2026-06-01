export function normalizeRepositoryRoot(repositoryRoot) {
  return repositoryRoot;
}

export function templateResource(resources, ref, fieldName, missingMessage) {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error(`workflow prompt render failed: ${fieldName} template reference is empty`);
  }
  const templates = resources?.templates ?? resources?.templateContentByRef ?? {};
  const loaded = templates instanceof Map ? templates.get(ref) : templates[ref];
  if (!loaded) throw new Error(missingMessage ?? `workflow prompt render failed: missing ${fieldName} template '${ref}'`);
  return typeof loaded === 'string' ? { content: loaded, path: ref } : { content: loaded.content, path: loaded.path ?? ref };
}

export function trimStable(value) {
  return value.trim().replace(/\r\n/g, '\n');
}

export function section(title, body) {
  return `## ${title}\n\n${body}\n`;
}
