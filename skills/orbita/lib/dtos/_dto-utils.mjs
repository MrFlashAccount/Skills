export function cloneFrozen(value) {
  const cloned = structuredClone(value);
  if (cloned && typeof cloned === 'object') return Object.freeze(cloned);
  return cloned;
}
