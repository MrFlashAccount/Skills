function typeName(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

export function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object; got ${typeName(value)}`);
  }
  return value;
}

export function assertString(value, name, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${name} must be a${allowEmpty ? '' : ' non-empty'} string`);
  }
}

export function assertOptionalString(value, name) {
  if (value !== undefined && typeof value !== 'string') throw new TypeError(`${name} must be a string when provided`);
}

export function assertArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
}

export function cloneFrozen(value) {
  const cloned = structuredClone(value);
  return Object.freeze(cloned);
}
