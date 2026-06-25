export const ROLE_DIRECTORY_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isRoleDirectoryName(role) {
  return typeof role === 'string' && ROLE_DIRECTORY_NAME_PATTERN.test(role);
}

export function assertRoleDirectoryName(role, { errorPrefix = 'workflow role validation failed' } = {}) {
  if (typeof role !== 'string' || role.length === 0) return;
  if (!isRoleDirectoryName(role)) {
    throw new Error(`${errorPrefix}: input.role must be a role directory name: ${role}`);
  }
}
