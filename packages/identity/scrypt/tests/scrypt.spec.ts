import { expect, it } from 'vitest'
import {
  SCRYPT_PROFILE,
  hashScrypt,
  memoryBytes,
  openScrypt,
  planAdmission,
  type PasswordPolicy,
  type ScryptCompute,
  type ScryptProfile,
} from '@omne-harness/scrypt'

const allow: PasswordPolicy = () => ({ ok: true })
const tiny: ScryptProfile = { N: 16, r: 1, p: 1, keylen: 32, saltBytes: 16, inFlight: 1, queue: 1 }

function heldCompute(): { compute: ScryptCompute; release: (byte: number) => void; calls: () => number } {
  const waiting: Array<(key: Uint8Array) => void> = []
  let calls = 0
  const compute: ScryptCompute = (_secret, _salt, _keylen, _cost, done) => {
    calls += 1
    waiting.push(key => done(undefined, key))
  }
  return {
    compute,
    release(byte) {
      const finish = waiting.shift()
      if (finish === undefined) throw new Error('no held scrypt call')
      finish(new Uint8Array(tiny.keylen).fill(byte))
    },
    calls: () => calls,
  }
}

it('uses the measured memory floor for the accepted profile', () => {
  expect(memoryBytes(SCRYPT_PROFILE)).toBe(128 * 8 * (2 ** 17 + 1 + 2))
  expect(SCRYPT_PROFILE).toMatchObject({ N: 2 ** 17, r: 8, p: 1, keylen: 32, saltBytes: 16, inFlight: 1, queue: 4 })
})

it('refuses a profile Node would treat as a hidden default', () => {
  const opened = openScrypt({ ...tiny, r: 0 })
  expect(opened).toEqual({ ok: false, code: 'invalid_profile' })
})

it('plans a single oversized job as memory_limit and a full queue as queue_full', () => {
  expect(
    planAdmission({
      running: 0,
      runningMemory: 0,
      queued: 0,
      jobMemory: 11,
      inFlight: 1,
      queueLimit: 1,
      memoryBudget: 10,
    }),
  ).toBe('memory_limit')
  expect(
    planAdmission({
      running: 1,
      runningMemory: 10,
      queued: 1,
      jobMemory: 10,
      inFlight: 1,
      queueLimit: 1,
      memoryBudget: 10,
    }),
  ).toBe('queue_full')
})

it('rejects a bad secret and a refused policy before compute', () => {
  const held = heldCompute()
  const opened = openScrypt(tiny, held.compute)
  if (!opened.ok) throw new Error('profile')
  expect(opened.module.derive('', allow)).toEqual({ code: 'invalid_secret' })
  expect(opened.module.derive('secret', undefined)).toEqual({ code: 'policy_missing' })
  const refused = opened.module.derive('secret', () => ({ ok: false }))
  expect(JSON.stringify(refused).includes('secret')).toBe(false)
  expect(refused).toEqual({ code: 'policy_refused' })
  expect(held.calls()).toBe(0)
})

it('keeps a running slot after the caller stops waiting, and refuses a full queue', async () => {
  const held = heldCompute()
  const opened = openScrypt(tiny, held.compute)
  if (!opened.ok) throw new Error('profile')
  const first = opened.module.derive('one', allow)
  if (!('done' in first)) throw new Error('expected a running job')
  await Promise.resolve()
  expect(first.code).toBe('running')
  expect(first.cancelWaiting()).toBe('stopped_waiting')
  const second = opened.module.derive('two', allow)
  if (!('done' in second)) throw new Error('expected a queued job')
  expect(second.code).toBe('queued')
  expect(opened.module.derive('three', allow)).toEqual({ code: 'queue_full' })
  expect(second.cancelWaiting()).toBe('left_queue')
  expect(await second.done).toEqual({ code: 'left_queue' })
  expect(held.calls()).toBe(1)
  held.release(1)
  await expect(first.done).resolves.toMatchObject({ code: 'material' })
})

it('drops queued work on close and waits for the running hash', async () => {
  const held = heldCompute()
  const opened = openScrypt({ ...tiny, queue: 2 }, held.compute)
  if (!opened.ok) throw new Error('profile')
  const running = opened.module.derive('one', allow)
  if (!('done' in running)) throw new Error('expected a running job')
  await Promise.resolve()
  const queued = opened.module.derive('two', allow)
  if (!('done' in queued)) throw new Error('expected a queued job')
  const closed = opened.module.close()
  expect(opened.module.derive('three', allow)).toEqual({ code: 'stopped' })
  await expect(queued.done).resolves.toEqual({ code: 'left_queue' })
  held.release(4)
  await expect(running.done).resolves.toMatchObject({ code: 'material' })
  await expect(closed).resolves.toEqual({ code: 'closed' })
  expect(held.calls()).toBe(1)
})

it('matches a derived secret and mismatches a different one', async () => {
  const opened = openScrypt(tiny)
  if (!opened.ok) throw new Error('profile')
  const started = opened.module.derive('correct-secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  const derived = (await started.done) as { code: string; material?: string }
  expect(derived.code).toBe('material')
  if (derived.material === undefined) throw new Error('missing material')
  const matched = opened.module.verify(derived.material, 'correct-secret')
  if (!('done' in matched)) throw new Error('expected verify job')
  await expect(matched.done).resolves.toEqual({ code: 'match' })
  const missed = opened.module.verify(derived.material, 'other-secret')
  if (!('done' in missed)) throw new Error('expected verify job')
  await expect(missed.done).resolves.toEqual({ code: 'mismatch' })
})

it('refuses stored parameters above the opened profile before another hash', async () => {
  const wide = openScrypt({ ...tiny, N: 32 })
  const narrow = openScrypt(tiny)
  if (!wide.ok || !narrow.ok) throw new Error('profile')
  const started = wide.module.derive('secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  const derived = (await started.done) as { code: string; material?: string }
  if (derived.material === undefined) throw new Error('missing material')
  expect(narrow.module.verify(derived.material, 'secret')).toEqual({ code: 'unavailable' })
})

it('reports an unknown scheme as mismatch and a broken material as unavailable', () => {
  const opened = openScrypt(tiny)
  if (!opened.ok) throw new Error('profile')
  expect(opened.module.verify('$password-scrypt$v=1$n=16,r=1,p=1$aaaa$bbbb', 'secret')).toEqual({
    code: 'mismatch',
  })
  expect(opened.module.verify('$scrypt$v=1$broken', 'secret')).toEqual({ code: 'unavailable' })
})

it('reproduces the RFC 7914 empty scrypt vector', async () => {
  const key = await hashScrypt('', new Uint8Array(0), 64, { N: 16, r: 1, p: 1 })
  expect(Buffer.from(key).toString('hex')).toBe(
    '77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906',
  )
})

it('derives and verifies the accepted profile on this host', async () => {
  const opened = openScrypt(SCRYPT_PROFILE)
  if (!opened.ok) throw new Error('profile')
  const started = opened.module.derive('profile-secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  const derived = (await started.done) as { code: string; material?: string }
  expect(derived.code).toBe('material')
  if (derived.material === undefined) throw new Error('missing material')
  expect(derived.material.startsWith('$scrypt$v=1$n=131072,r=8,p=1,k=32$')).toBe(true)
  const checked = opened.module.verify(derived.material, 'profile-secret')
  if (!('done' in checked)) throw new Error('expected verify')
  await expect(checked.done).resolves.toEqual({ code: 'match' })
  await expect(opened.module.close()).resolves.toEqual({ code: 'closed' })
})
