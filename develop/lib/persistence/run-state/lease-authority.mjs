import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_LEASE_MS = 30 * 60 * 1000;
export const DEFAULT_TOKEN_EPOCH = 1;

export function generateLeaseToken() {
  return randomBytes(32).toString('base64url');
}

export function hashLeaseToken(token) {
  const value = String(token ?? '');
  if (value.length === 0) throw new Error('workflow run token is required');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function safeTokenHashMatches(expectedHash, token) {
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false;
  let actualHash;
  try { actualHash = hashLeaseToken(token); }
  catch { return false; }
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildTokenLease({ token, leaseMs = DEFAULT_LEASE_MS, now = new Date(), tokenEpoch = DEFAULT_TOKEN_EPOCH } = {}) {
  const ms = Number(leaseMs);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('leaseMs must be a positive number');
  return {
    tokenHash: hashLeaseToken(token),
    tokenEpoch,
    leaseExpiresAt: new Date(now.getTime() + ms).toISOString(),
  };
}

export function renewTokenLease(workerLease, { leaseMs = DEFAULT_LEASE_MS, now = new Date() } = {}) {
  if (!workerLease?.tokenHash || !workerLease?.tokenEpoch) throw new Error('workflow run lease authority is invalid');
  const ms = Number(leaseMs);
  if (!Number.isFinite(ms) || ms <= 0) throw new Error('leaseMs must be a positive number');
  return {
    tokenHash: workerLease.tokenHash,
    tokenEpoch: workerLease.tokenEpoch,
    leaseExpiresAt: new Date(now.getTime() + ms).toISOString(),
  };
}

export function occupancyForLease(workerLease, now = new Date()) {
  if (!workerLease) return { state: 'unclaimed', claimed: false };
  const expiresAt = Date.parse(workerLease.leaseExpiresAt ?? '');
  const hasFreshExpiry = Number.isFinite(expiresAt) && expiresAt > now.getTime();
  return hasFreshExpiry
    ? { state: 'occupied', claimed: true, leaseExpiresAt: workerLease.leaseExpiresAt }
    : { state: 'stale', claimed: false, leaseExpiresAt: workerLease.leaseExpiresAt };
}

export function assertFreshTokenAuthority(workerLease, token, { runId, now = new Date() } = {}) {
  if (!token) throw new Error('workflow run token is required');
  if (!workerLease) throw new Error(`workflow run lease is not claimed: ${runId}`);
  const expiresAt = Date.parse(workerLease.leaseExpiresAt ?? '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) throw new Error(`workflow run lease is stale: ${runId}`);
  if (!safeTokenHashMatches(workerLease.tokenHash, token)) throw new Error(`workflow run is occupied: ${runId}`);
}
