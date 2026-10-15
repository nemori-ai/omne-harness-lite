export interface ScryptCost {
  readonly N: number
  readonly r: number
  readonly p: number
}

/** Smallest maxmem OpenSSL 3.6.2 accepted. Measured, not 128*N*r. */
export function memoryBytes(cost: ScryptCost): number | undefined {
  if (!Number.isSafeInteger(cost.N) || !Number.isSafeInteger(cost.r) || !Number.isSafeInteger(cost.p)) {
    return undefined
  }
  const bytes = 128 * cost.r * (cost.N + cost.p + 2)
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return undefined
  return bytes
}

export function isPowerOfTwo(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 2) return false
  let rest = value
  while (rest > 1) {
    if (rest % 2 !== 0) return false
    rest = rest / 2
  }
  return true
}
