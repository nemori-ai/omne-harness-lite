import { scrypt } from 'node:crypto'
import { memoryBytes, type ScryptCost } from './memory.ts'

export type ScryptCompute = (
  secret: string,
  salt: Uint8Array,
  keylen: number,
  cost: ScryptCost,
  done: (error: unknown, key?: Uint8Array) => void,
) => void

export function hashScrypt(
  secret: string,
  salt: Uint8Array,
  keylen: number,
  cost: ScryptCost,
): Promise<Uint8Array> {
  const maxmem = memoryBytes(cost)
  if (maxmem === undefined) return Promise.reject(new Error('scrypt cost is not a safe integer'))
  return new Promise((resolve, reject) => {
    scrypt(Buffer.from(secret, 'utf8'), salt, keylen, { N: cost.N, r: cost.r, p: cost.p, maxmem }, (error, key) => {
      if (error !== null) reject(error)
      else resolve(key)
    })
  })
}

export const nodeScryptCompute: ScryptCompute = (secret, salt, keylen, cost, done) => {
  hashScrypt(secret, salt, keylen, cost).then(
    key => done(undefined, key),
    error => done(error),
  )
}
