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

it('refuses each illegal profile field before a hash starts', () => {
  const illegal: ScryptProfile[] = [
    { ...tiny, N: 3 },
    { ...tiny, r: 0 },
    { ...tiny, p: 0 },
    { ...tiny, keylen: 15 },
    { ...tiny, keylen: 65 },
    { ...tiny, saltBytes: 15 },
    { ...tiny, saltBytes: 65 },
    { ...tiny, inFlight: 0 },
    { ...tiny, queue: 0 },
  ]
  for (const profile of illegal) {
    expect(openScrypt(profile)).toEqual({ ok: false, code: 'invalid_profile' })
  }
})

it('queues when the running count is full even if memory still fits', () => {
  expect(
    planAdmission({
      running: 1,
      runningMemory: 0,
      queued: 0,
      jobMemory: 10,
      inFlight: 1,
      queueLimit: 4,
      memoryBudget: 100,
    }),
  ).toBe('queue')
  expect(
    planAdmission({
      running: 0,
      runningMemory: 90,
      queued: 0,
      jobMemory: 20,
      inFlight: 2,
      queueLimit: 4,
      memoryBudget: 100,
    }),
  ).toBe('queue')
})

it('starts the queued job after the running job finishes', async () => {
  const held = heldCompute()
  const opened = openScrypt(tiny, held.compute)
  if (!opened.ok) throw new Error('profile')
  const first = opened.module.derive('one', allow)
  if (!('done' in first)) throw new Error('expected a running job')
  await Promise.resolve()
  const second = opened.module.derive('two', allow)
  if (!('done' in second)) throw new Error('expected a queued job')
  expect(held.calls()).toBe(1)
  held.release(1)
  await first.done
  await Promise.resolve()
  expect(held.calls()).toBe(2)
  held.release(2)
  await expect(second.done).resolves.toMatchObject({ code: 'material' })
})

it('rejects a material that is not a scrypt string before compute', () => {
  const opened = openScrypt(tiny)
  if (!opened.ok) throw new Error('profile')
  expect(opened.module.verify('not-a-material', 'secret')).toEqual({ code: 'unavailable' })
  expect(opened.module.verify('$', 'secret')).toEqual({ code: 'mismatch' })
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

it('rejects a bad secret and a refused policy before compute', async () => {
  const held = heldCompute()
  const opened = openScrypt(tiny, held.compute)
  if (!opened.ok) throw new Error('profile')
  let policyCalls = 0
  expect(opened.module.derive('', () => {
    policyCalls += 1
    return { ok: false }
  })).toEqual({ code: 'policy_refused' })
  expect(policyCalls).toBe(1)
  expect(opened.module.derive('secret', undefined)).toEqual({ code: 'policy_missing' })
  const refused = opened.module.derive('secret', () => ({ ok: false }))
  expect(JSON.stringify(refused).includes('secret')).toBe(false)
  expect(opened.module.derive('secret', () => {
    throw new Error('policy-blew-up')
  })).toEqual({ code: 'unavailable' })
  expect(opened.module.derive(1 as unknown as string, allow)).toEqual({ code: 'invalid_secret' })
  const broken: ScryptCompute = (_secret, _salt, _keylen, _cost, done) => {
    done(null)
  }
  const failing = openScrypt(tiny, broken)
  if (!failing.ok) throw new Error('profile')
  const started = failing.module.derive('secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  await expect(started.done).resolves.toEqual({ code: 'unavailable' })
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
  expect(second.cancelWaiting()).toBe('already_left')
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
  const derived = await started.done
  if (derived.code !== 'material') throw new Error(derived.code)
  const matched = opened.module.verify(derived.material, 'correct-secret')
  if (!('done' in matched)) throw new Error('expected verify job')
  await expect(matched.done).resolves.toEqual({ code: 'match' })
  const missed = opened.module.verify(derived.material, 'other-secret')
  if (!('done' in missed)) throw new Error('expected verify job')
  await expect(missed.done).resolves.toEqual({ code: 'mismatch' })
})

it('checks a stored material with its own cost when that cost still fits', async () => {
  const wide = openScrypt({ ...tiny, N: 32 })
  const narrow = openScrypt(tiny)
  if (!wide.ok || !narrow.ok) throw new Error('profile')
  const started = narrow.module.derive('correct-secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  const derived = await started.done
  if (derived.code !== 'material') throw new Error(derived.code)
  const checked = wide.module.verify(derived.material, 'correct-secret')
  if (!('done' in checked)) throw new Error('expected verify')
  await expect(checked.done).resolves.toEqual({ code: 'match' })
  const reordered = derived.material.replace('n=16,r=1,p=1,k=32', 'r=1,p=1,k=32,n=16')
  expect(wide.module.verify(reordered, 'correct-secret')).toEqual({ code: 'unavailable' })
})

it('refuses stored parameters above the opened profile before another hash', async () => {
  const wide = openScrypt({ ...tiny, N: 32 })
  const narrow = openScrypt(tiny)
  if (!wide.ok || !narrow.ok) throw new Error('profile')
  const started = wide.module.derive('secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  const derived = await started.done
  if (derived.code !== 'material') throw new Error(derived.code)
  expect(narrow.module.verify(derived.material, 'secret')).toEqual({ code: 'unavailable' })
})

it('refuses a stored r, p, or key length above the opened profile', async () => {
  const opened = openScrypt(tiny)
  if (!opened.ok) throw new Error('profile')
  const started = opened.module.derive('secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  const derived = await started.done
  if (derived.code !== 'material') throw new Error(derived.code)
  expect(opened.module.verify(derived.material.replace('r=1', 'r=2'), 'secret')).toEqual({ code: 'unavailable' })
  expect(opened.module.verify(derived.material.replace('p=1', 'p=2'), 'secret')).toEqual({ code: 'unavailable' })
  expect(opened.module.verify(derived.material.replace('k=32', 'k=33'), 'secret')).toEqual({ code: 'unavailable' })
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
  const derived = await started.done
  if (derived.code !== 'material') throw new Error(derived.code)
  expect(derived.material.startsWith('$scrypt$v=1$n=131072,r=8,p=1,k=32$')).toBe(true)
  const checked = opened.module.verify(derived.material, 'profile-secret')
  if (!('done' in checked)) throw new Error('expected verify')
  await expect(checked.done).resolves.toEqual({ code: 'match' })
  await expect(opened.module.close()).resolves.toEqual({ code: 'closed' })
})

it('keeps the profile accepted at open when the caller mutates it', async () => {
  const mutable = { ...tiny }
  const opened = openScrypt(mutable)
  if (!opened.ok) throw new Error('profile')
  const started = opened.module.derive('alias-secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  mutable.N = 32
  const derived = await started.done
  if (derived.code !== 'material') throw new Error(derived.code)
  expect(derived.material.includes('n=16,')).toBe(true)
  const checked = opened.module.verify(derived.material, 'alias-secret')
  if (!('done' in checked)) throw new Error('expected verify')
  await expect(checked.done).resolves.toEqual({ code: 'match' })
})

it('rejects a safe integer that is not a power of two before compute', () => {
  let calls = 0
  const compute: ScryptCompute = () => {
    calls += 1
  }
  expect(openScrypt({ ...tiny, N: 2 ** 32 + 1 }, compute)).toEqual({ ok: false, code: 'invalid_profile' })
  const opened = openScrypt(tiny, compute)
  if (!opened.ok) throw new Error('profile')
  const salt = Buffer.alloc(16).toString('base64url')
  const key = Buffer.alloc(32).toString('base64url')
  expect(opened.module.verify(`$scrypt$v=1$n=4294967297,r=1,p=1,k=32$${salt}$${key}`, 'secret')).toEqual({
    code: 'unavailable',
  })
  expect(calls).toBe(0)
})

it('settles a synchronous compute failure and refuses a short key', async () => {
  const failing = openScrypt(tiny, () => {
    throw new Error('synthetic-compute-failure')
  })
  if (!failing.ok) throw new Error('profile')
  const started = failing.module.derive('synthetic-secret', allow)
  if (!('done' in started)) throw new Error('expected a job')
  await expect(started.done).resolves.toEqual({ code: 'unavailable' })
  await expect(failing.module.close()).resolves.toEqual({ code: 'closed' })
  const shortKey = openScrypt(tiny, (_secret, _salt, _keylen, _cost, done) => {
    done(undefined, new Uint8Array(1))
  })
  if (!shortKey.ok) throw new Error('profile')
  const broken = shortKey.module.derive('synthetic-short-key', allow)
  if (!('done' in broken)) throw new Error('expected a job')
  await expect(broken.done).resolves.toEqual({ code: 'unavailable' })
})

it('rejects an oversized material and secret before decode or compute', () => {
  const held = heldCompute()
  const opened = openScrypt(tiny, held.compute)
  if (!opened.ok) throw new Error('profile')
  const key = Buffer.alloc(32).toString('base64url')
  const huge = 'A'.repeat(1024 * 1024)
  const material = `$scrypt$v=1$n=16,r=1,p=1,k=32$${huge}$${key}`
  const original = Buffer.from.bind(Buffer)
  let decodedHuge = false
  Buffer.from = ((value: unknown, ...args: unknown[]) => {
    if (value === huge) decodedHuge = true
    return original(value as string, ...(args as []))
  }) as typeof Buffer.from
  try {
    expect(opened.module.verify(material, 'secret')).toEqual({ code: 'unavailable' })
  } finally {
    Buffer.from = original
  }
  expect(decodedHuge).toBe(false)
  expect(opened.module.derive('a'.repeat(4097), allow)).toEqual({ code: 'unavailable' })
  expect(held.calls()).toBe(0)
})
