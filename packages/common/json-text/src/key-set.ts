/** Keys of this many units or more go into the digest buckets of `KeySet`. */
const LONG_KEY_UNITS = 256
const HASH_PRIME_A = 16777619
const HASH_PRIME_B = 0x9e3779b1
const SEEDS = new DataView(globalThis.crypto.getRandomValues(new Uint8Array(8)).buffer)
const SEED_A = SEEDS.getUint32(0)
const SEED_B = SEEDS.getUint32(4)

/** Two 32-bit FNV-1a-style passes over the whole key, from per-process random offsets. */
function digest(key: string): string {
  let a = SEED_A
  let b = SEED_B
  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index)
    a = Math.imul(a ^ unit, HASH_PRIME_A)
    b = Math.imul(b ^ unit, HASH_PRIME_B)
  }
  return `${a >>> 0}:${b >>> 0}`
}

/**
 * The keys of one object. The engine hashes a string of 16,384 or more units by its length only,
 * and the seed of the digest stops crafted collisions, so short keys use a native Set and long
 * keys use buckets of a seeded digest. A key is a repeat only on exact equality. Equal keys have
 * equal length, so the two structures never need a cross-check. The digest is a parameter so a
 * test can force every long key into one bucket.
 */
export class KeySet {
  private readonly short = new Set<string>()
  private readonly long = new Map<string, string[]>()
  size = 0
  private readonly digestOf: (key: string) => string

  constructor(digestOf: (key: string) => string = digest) {
    this.digestOf = digestOf
  }

  /** Adds the key. Returns false, and keeps the set as it was, when the key is already in it. */
  add(key: string): boolean {
    if (key.length < LONG_KEY_UNITS) {
      if (this.short.has(key)) return false
      this.short.add(key)
    } else {
      const id = this.digestOf(key)
      const bucket = this.long.get(id)
      if (bucket === undefined) this.long.set(id, [key])
      else if (bucket.includes(key)) return false
      else bucket.push(key)
    }
    this.size += 1
    return true
  }
}
