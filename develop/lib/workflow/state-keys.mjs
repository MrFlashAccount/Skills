export const RESERVED_STATE_KEYS = Object.freeze(['artifacts', 'results', 'outputs', 'attempts']);
export const RESERVED_STEP_IDS = RESERVED_STATE_KEYS;

export function isReservedStateKey(value) {
  return RESERVED_STATE_KEYS.includes(value);
}
