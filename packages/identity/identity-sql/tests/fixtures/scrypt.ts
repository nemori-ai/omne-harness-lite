// A small scrypt configuration for tests. Only N differs from SCRYPT_PROFILE, to keep a derivation
// in the millisecond range. `gatedCompute` can hold every computation until the test releases it,
// so a test can fill the scrypt queue or keep a call in flight across `stop()`.
import {
  hashScrypt,
  openScrypt,
  type ScryptCompute,
  type ScryptModule,
  type ScryptProfile,
} from '@omne-harness/scrypt'

export const TEST_SCRYPT_PROFILE: ScryptProfile = {
  N: 2 ** 10,
  r: 8,
  p: 1,
  keylen: 32,
  saltBytes: 16,
  inFlight: 1,
  queue: 8,
}

export type OpenedScrypt = Readonly<{ module: ScryptModule; decoyMaterial: string }>

/** Opens a module and derives the decoy material, as the plugin body does. */
export async function openTestScrypt(
  profile: ScryptProfile = TEST_SCRYPT_PROFILE,
  compute?: ScryptCompute,
): Promise<OpenedScrypt> {
  const opened = compute === undefined ? openScrypt(profile) : openScrypt(profile, compute)
  if (!opened.ok) throw new Error('test scrypt profile rejected')
  const admitted = opened.module.derive('decoy-secret', () => ({ ok: true }))
  if (!('done' in admitted)) throw new Error(`decoy derive refused: ${admitted.code}`)
  const done = await admitted.done
  if (done.code !== 'material') throw new Error(`decoy derive ended with ${done.code}`)
  return { module: opened.module, decoyMaterial: done.material }
}

export type GatedCompute = Readonly<{
  compute: ScryptCompute
  /** Later computations wait until `release()`. */
  hold(): void
  /** Lets every held computation finish, and later ones run at once. */
  release(): void
  /** Number of computations that entered `compute`. */
  calls(): number
}>

/** Real scrypt whose completion can be held by the test. The gate starts open. */
export function gatedCompute(): GatedCompute {
  let open = true
  let count = 0
  const waiting: (() => void)[] = []
  return {
    compute(secret, salt, keylen, cost, done) {
      count += 1
      const run = (): void => {
        hashScrypt(secret, salt, keylen, cost).then(
          key => done(undefined, key),
          error => done(error),
        )
      }
      if (open) run()
      else waiting.push(run)
    },
    hold() {
      open = false
    },
    release() {
      open = true
      for (const start of waiting.splice(0)) start()
    },
    calls: () => count,
  }
}
