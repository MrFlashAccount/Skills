export function registryWith(...schemaGroups) {
  return schemaGroups.flatMap((group) => Array.isArray(group) ? group : group ? [group] : []);
}
