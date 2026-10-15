import { isPowerOfTwo, memoryBytes } from './memory.ts'

export interface ScryptProfile {
  readonly N: number
  readonly r: number
  readonly p: number
  readonly keylen: number
  readonly saltBytes: number
  readonly inFlight: number
  readonly queue: number
}

/** OWASP minimum scrypt cost. One job is about 128 MiB and about 200 ms on the measured arm64 host. */
export const SCRYPT_PROFILE: ScryptProfile = {
  N: 2 ** 17,
  r: 8,
  p: 1,
  keylen: 32,
  saltBytes: 16,
  inFlight: 1,
  queue: 4,
}

export function profileMemory(profile: ScryptProfile): number | undefined {
  const one = memoryBytes(profile)
  if (one === undefined || !Number.isSafeInteger(profile.inFlight) || profile.inFlight < 1) return undefined
  const budget = one * profile.inFlight
  return Number.isSafeInteger(budget) ? budget : undefined
}

export function profileValid(profile: ScryptProfile): boolean {
  return (
    isPowerOfTwo(profile.N) &&
    Number.isSafeInteger(profile.r) &&
    profile.r >= 1 &&
    Number.isSafeInteger(profile.p) &&
    profile.p >= 1 &&
    Number.isSafeInteger(profile.keylen) &&
    profile.keylen >= 16 &&
    profile.keylen <= 64 &&
    Number.isSafeInteger(profile.saltBytes) &&
    profile.saltBytes >= 16 &&
    profile.saltBytes <= 64 &&
    Number.isSafeInteger(profile.inFlight) &&
    profile.inFlight >= 1 &&
    Number.isSafeInteger(profile.queue) &&
    profile.queue >= 1 &&
    profileMemory(profile) !== undefined
  )
}
