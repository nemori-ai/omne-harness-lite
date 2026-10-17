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

export interface AcceptedProfile {
  readonly budget: number
  readonly jobMemory: number
}

function countsOk(profile: ScryptProfile): boolean {
  return (
    Number.isSafeInteger(profile.r) &&
    profile.r >= 1 &&
    Number.isSafeInteger(profile.p) &&
    profile.p >= 1 &&
    Number.isSafeInteger(profile.inFlight) &&
    profile.inFlight >= 1 &&
    Number.isSafeInteger(profile.queue) &&
    profile.queue >= 1
  )
}

function lengthsOk(profile: ScryptProfile): boolean {
  return (
    Number.isSafeInteger(profile.keylen) &&
    profile.keylen >= 16 &&
    profile.keylen <= 64 &&
    Number.isSafeInteger(profile.saltBytes) &&
    profile.saltBytes >= 16 &&
    profile.saltBytes <= 64
  )
}

export function acceptedProfile(profile: ScryptProfile): AcceptedProfile | undefined {
  if (!isPowerOfTwo(profile.N) || !countsOk(profile) || !lengthsOk(profile)) return undefined
  const jobMemory = memoryBytes(profile)
  if (jobMemory === undefined) return undefined
  const budget = jobMemory * profile.inFlight
  if (!Number.isSafeInteger(budget)) return undefined
  return { budget, jobMemory }
}
