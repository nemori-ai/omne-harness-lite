import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { encodeRunnerAdmissionToken } from '@omne-harness-lite/loop-extension-runner'
import type {
  ToolAdmissionPassSourceOperations,
  AdmissionToken,
} from '@omne-harness-lite/tool-admission'
import { fixture, parsedCall, scope } from './provider-fixture.ts'

const unavailable = { kind: 'failed', reason: 'unavailable' }
const invalid = (reason: string) => ({ kind: 'invalid', reason })

test('uses one backing borrow and returns its actual complete tail without consuming the token', async () => {
  const f = fixture()
  try {
    const expected = { kind: 'valid', checked: { scope, ownerGeneration: 'owner-one', tail: 2 } }
    expect(await f.verify()).toEqual(expected)
    expect(await f.verify(parsedCall('call', { n: new LosslessNumber('1.00') }))).toEqual(expected)
    expect(f.borrow).toHaveBeenCalledTimes(1)
    expect(f.read.mock.calls).toEqual([
      [scope.session, 0],
      [scope.session, 0],
    ])
    expect(
      vi.mocked(f.authority.authorize).mock.calls.every(call => call[2] === 'tool.submit'),
    ).toBe(true)
  } finally {
    await f.provider.close()
  }
  expect(f.release).toHaveBeenCalledTimes(1)
})
test('checks current authorization before revealing call or argument mismatch', async () => {
  const f = fixture()
  try {
    f.revoke()
    expect(await f.verify(parsedCall('other', { n: 2 }))).toEqual({
      kind: 'failed',
      reason: 'notAuthorized',
    })
    expect(f.read).not.toHaveBeenCalled()
    expect(f.history.inspect).not.toHaveBeenCalled()
  } finally {
    await f.provider.close()
  }
})
test('gives call mismatch priority over arguments, and arguments priority over missing admission', async () => {
  const f = fixture()
  try {
    f.setHistory({ kind: 'notFound' })
    expect(await f.verify(parsedCall('other', { n: 2 }))).toEqual(invalid('call_mismatch'))
    expect(await f.verify(parsedCall('call', { n: 2 }))).toEqual(invalid('arguments_changed'))
    expect(f.read).not.toHaveBeenCalled()
    expect(await f.verify()).toEqual(invalid('not_admitted'))
  } finally {
    await f.provider.close()
  }
})
test.each(['pending', 'missing', 'unavailable', 'ended', 'advanced', 'renamed'] as const)(
  'distinguishes %s facts',
  async scenario => {
    const f = fixture()
    try {
      if (scenario === 'pending') f.setFacts({ ...f.facts(), batch: { kind: 'pending' } })
      if (scenario === 'missing') f.setHistory({ kind: 'notFound' })
      if (scenario === 'unavailable') f.setHistory({ kind: 'unavailable' })
      if (scenario === 'ended') f.setFacts({ ...f.facts(), runState: 'ended' })
      if (scenario === 'advanced') f.setFacts({ ...f.facts(), latestAttempt: 2 })
      const result = await f.verify(
        scenario === 'renamed' ? { ...f.call, tool: 'another' } : f.call,
      )
      if (scenario === 'advanced') expect(result).toHaveProperty('kind', 'valid')
      else
        expect(result).toEqual(
          scenario === 'unavailable'
            ? unavailable
            : invalid(
                scenario === 'ended'
                  ? 'run_ended'
                  : scenario === 'renamed'
                    ? 'arguments_changed'
                    : 'not_admitted',
              ),
        )
    } finally {
      await f.provider.close()
    }
  },
)
test.each([
  'tenant',
  'session',
  'position',
  'tail',
  'duplicate',
  'unknownField',
  'getter',
] as const)('rejects an invalid physical prefix: %s', async scenario => {
  const f = fixture(),
    get = vi.fn(() => 1)
  try {
    const rows = f.rows().map(row => ({ ...row }))
    if (scenario === 'tenant')
      rows[0] = {
        ...rows[0]!,
        tenant: { ...scope.tenant, account: 'other' as typeof scope.tenant.account },
      }
    if (scenario === 'session') rows[0] = { ...rows[0]!, session: 'other' as typeof scope.session }
    if (scenario === 'position') rows[0] = { ...rows[0]!, position: 2 }
    if (scenario === 'duplicate') rows[1] = { ...rows[0]!, position: 2 }
    if (scenario === 'unknownField') Object.assign(rows[0]!, { extra: true })
    if (scenario === 'getter')
      Object.defineProperty(rows[0]!, 'position', { enumerable: true, get })
    f.read.mockResolvedValueOnce({ entries: rows, tail: scenario === 'tail' ? 3 : 2 })
    expect(await f.verify()).toEqual(unavailable)
    expect(f.history.inspect).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  } finally {
    await f.provider.close()
  }
})
test.each(['revoked', 'generation', 'read-failed', 'read-threw'] as const)(
  'fails closed across IO: %s',
  async scenario => {
    const f = fixture()
    try {
      f.read.mockImplementationOnce(async () => {
        if (scenario === 'revoked') f.revoke()
        if (scenario === 'generation') f.changeGeneration()
        if (scenario === 'read-threw') throw new Error('unavailable log')
        return scenario === 'read-failed'
          ? { failure: 'unavailable' }
          : { entries: f.rows(), tail: 2 }
      })
      expect(await f.verify()).toEqual(
        scenario === 'revoked' ? { kind: 'failed', reason: 'notAuthorized' } : unavailable,
      )
      expect(f.history.inspect).not.toHaveBeenCalled()
    } finally {
      await f.provider.close()
    }
  },
)
test('closes both gates, invalidates old judgments and drains actual IO before releasing', async () => {
  const f = fixture()
  const bound = await f.provider.forPass(f.access, scope, 'pass')
  if (bound.kind !== 'bound') throw new Error('missing fixture binding')
  const pending = f.blockRead(),
    working = f.verify()
  await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1))
  const closing = f.provider.close(),
    secondClose = f.provider.close()
  expect(f.release).not.toHaveBeenCalled()
  expect(await f.verify()).toEqual(unavailable)
  expect(await f.provider.forPass(f.access, scope, 'pass')).toEqual({
    kind: 'rejected',
    reason: 'unavailable',
  })
  expect(await bound.judgment.admit([f.input])).toEqual(unavailable)
  pending.resolve({ entries: f.rows(), tail: 2 })
  expect(await working).toEqual(unavailable)
  await Promise.all([closing, secondClose])
  await f.provider.close()
  expect(f.release).toHaveBeenCalledTimes(1)
})
test('a failed release remains visible and can be retried without reopening admission', async () => {
  const f = fixture()
  f.release.mockRejectedValueOnce(new Error('physical owner pending'))
  await expect(f.provider.close()).rejects.toThrow('physical owner pending')
  expect(await f.verify()).toEqual(unavailable)
  await f.provider.close()
  expect(f.release).toHaveBeenCalledTimes(2)
})
test('captures input before awaits and rejects provisional tokens or accessors before IO', async () => {
  const f = fixture(),
    get = vi.fn(() => 'echo')
  try {
    const call = { ...f.call }
    Object.defineProperty(call, 'tool', { enumerable: true, get })
    expect(await f.verify(call)).toEqual({ kind: 'failed', reason: 'invalidInput' })
    expect(
      await f.provider.verifyToken(
        f.access,
        scope,
        'admission.1.invalid' as AdmissionToken,
        f.call,
      ),
    ).toEqual({ kind: 'failed', reason: 'invalidInput' })
    expect(get).not.toHaveBeenCalled()
    expect(f.read).not.toHaveBeenCalled()
    const input = { ...f.call, arguments: { n: 1 } }
    const result = f.verify(input)
    input.arguments.n = 2
    expect(await result).toHaveProperty('kind', 'valid')
  } finally {
    await f.provider.close()
  }
})

test('a forged argument digest cannot replace the actual final parameters', async () => {
  const f = fixture()
  try {
    const call = parsedCall('call', { n: 2 }),
      token = encodeRunnerAdmissionToken(call, f.finalKey)
    if (typeof token !== 'string') throw new Error('token fixture')
    expect(await f.provider.verifyToken(f.access, scope, token, call)).toEqual(
      invalid('arguments_changed'),
    )
  } finally {
    await f.provider.close()
  }
})
test('physical owner replacement invalidates an existing judgment as well as verification', async () => {
  const f = fixture()
  try {
    const bound = await f.provider.forPass(f.access, scope, 'pass')
    if (bound.kind !== 'bound') throw new Error('binding fixture')
    f.changeGeneration()
    expect(await bound.judgment.admit([f.input])).toEqual(unavailable)
    expect(await f.verify()).toEqual(unavailable)
    expect(f.read).not.toHaveBeenCalled()
  } finally {
    await f.provider.close()
  }
})
test('the held borrow survives until both source and log reads have actually ended', async () => {
  const f = fixture()
  const sourceValue = await f.source.read(f.access, scope, 'pass')
  const source =
    Promise.withResolvers<Awaited<ReturnType<ToolAdmissionPassSourceOperations['read']>>>()
  vi.mocked(f.source.read).mockImplementationOnce(() => source.promise)
  const read = f.blockRead(),
    verifying = f.verify(),
    binding = f.provider.forPass(f.access, scope, 'pass')
  await vi.waitFor(() => {
    expect(f.read).toHaveBeenCalledTimes(1)
    expect(f.source.read).toHaveBeenCalledTimes(2)
  })
  const closing = f.provider.close()
  read.resolve({ entries: f.rows(), tail: 2 })
  expect(await verifying).toEqual(unavailable)
  expect(f.release).not.toHaveBeenCalled()
  source.resolve(sourceValue)
  expect(await binding).toEqual({ kind: 'rejected', reason: 'unavailable' })
  await closing
  expect(f.release).toHaveBeenCalledTimes(1)
})
