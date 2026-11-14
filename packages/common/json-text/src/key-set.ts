const LONG_KEY_UNITS = 256
const HASH_PRIME_A = 16777619
const HASH_PRIME_B = 0x9e3779b1
const SEEDS = new DataView(globalThis.crypto.getRandomValues(new Uint8Array(8)).buffer)
const SEED_A = SEEDS.getUint32(0)
const SEED_B = SEEDS.getUint32(4)

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

// Short keys use a native Set. The engine hashes a string of 16,384 or more units by its length only,
// so long keys use buckets of a seeded digest, which stops crafted collisions.
export class KeySet {
  private readonly short = new Set<string>()
  private readonly long = new Map<string, string[]>()
  size = 0
  private readonly digestOf: (key: string) => string

  constructor(digestOf: (key: string) => string = digest) {
    this.digestOf = digestOf
  }

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
