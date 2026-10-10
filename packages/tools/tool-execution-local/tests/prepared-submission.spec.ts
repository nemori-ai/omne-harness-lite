import { afterEach, expect, test, vi } from 'vitest'
import type { PreparedToolExecution } from '@omne-harness-lite/tool-execution-runtime'
import { capturePreparedExecution, verifyPreparedExecution } from '../src/prepared-submission.ts'
import { fixture, scope } from './execution-owner-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function given() {
  const f = await fixture()
  cleanup.push(f.close)
  return f
}
function captured(input: PreparedToolExecution) {
  const value = capturePreparedExecution(input)
  if ('reason' in value) throw new Error(`invalid prepared fixture: ${value.reason}`)
  return value
}

test.each(['access', 'ref', 'origin', 'call', 'source', 'afterAction', 'selected', 'args'])(
  'rejects a %s getter without evaluating it',
  async field => {
    const f = await given()
    const input = { ...f.prepared }
    const get = vi.fn(() => {
      throw new Error('caller getter')
    })
    Object.defineProperty(input, field, { get, enumerable: true })
    expect(capturePreparedExecution(input)).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(get).not.toHaveBeenCalled()
  },
)

test('retains the exact opaque access without inspecting it', async () => {
  const f = await given()
  const trap = vi.fn(() => {
    throw new Error('opaque access inspection')
  })
  const access = new Proxy(
    {},
    { get: trap, ownKeys: trap, getPrototypeOf: trap },
  ) as PreparedToolExecution['access']
  const result = captured({ ...f.prepared, access })
  expect(result.request.access).toBe(access)
  expect(trap).not.toHaveBeenCalled()
})

test('captures all ordinary input before caller mutation', async () => {
  const f = await given()
  if (f.prepared.call.unparseable) throw new Error('ordinary fixture call required')
  const call = { ...f.prepared.call, arguments: { value: 'original' } }
  const afterAction = { pass: 'original-pass', selectedChain: [] }
  const result = captured({ ...f.prepared, call, args: call.arguments, afterAction })
  call.arguments.value = 'changed'
  afterAction.pass = 'changed-pass'
  expect(result.request.call.arguments).toEqual({ value: 'original' })
  expect(result.chain).toEqual({ pass: 'original-pass', chain: [] })
})

test.each([
  { args: { value: 'different' } },
  { origin: { run: '', attempt: 1, assistantMessage: 'reply' } },
  { afterAction: { pass: '', selectedChain: [] } },
  { afterAction: { pass: 'pass', selectedChain: [], extra: true } },
  { extra: true },
])('rejects invalid or inconsistent prepared data %#', async patch => {
  const f = await given()
  expect(capturePreparedExecution({ ...f.prepared, ...patch } as PreparedToolExecution)).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
})

test.each(['session', 'callId', 'tenant'] as const)(
  'rejects an inconsistent %s without looking up a tool',
  async key => {
    const f = await given()
    const foreign = key === 'tenant' ? { ...scope.tenant, account: 'foreign-account' } : 'foreign'
    const result = capturePreparedExecution({
      ...f.prepared,
      ref: { ...f.prepared.ref, [key]: foreign },
    } as PreparedToolExecution)
    expect(result).toEqual({ kind: 'rejected', reason: 'invalidInput' })
    expect(f.implementation).not.toHaveBeenCalled()
  },
)

test.each([
  { kind: 'failed', reason: 'unavailable', expected: 'runtimeUnavailable' },
  { kind: 'invalid', reason: 'run_ended', expected: 'runEnded' },
  { kind: 'invalid', reason: 'not_admitted', expected: 'admissionMissing' },
  { kind: 'invalid', reason: 'arguments_changed', expected: 'callConflict' },
] as const)('preserves the original token rejection $reason', async value => {
  const f = await given()
  const { expected, ...failure } = value
  const verify = vi.spyOn(f.admission, 'verifyToken').mockResolvedValue(failure)
  expect(await verifyPreparedExecution(captured(f.prepared), () => f.admission)).toEqual({
    kind: 'rejected',
    reason: expected,
  })
  expect(verify).toHaveBeenCalledOnce()
  expect(f.implementation).not.toHaveBeenCalled()
})

test('requires the original admission provider after a successful token check', async () => {
  const f = await given()
  let active = true
  const verify = f.admission.verifyToken
  vi.spyOn(f.admission, 'verifyToken').mockImplementation(async (...args) => {
    const result = await verify(...args)
    active = false
    return result
  })
  expect(
    await verifyPreparedExecution(captured(f.prepared), () => (active ? f.admission : undefined)),
  ).toEqual({ kind: 'rejected', reason: 'admissionMissing' })
})

test.each(['tenant', 'session', 'tail'] as const)(
  'refuses a token check for another %s',
  async field => {
    const f = await given()
    const checked = { scope, ownerGeneration: 'actual-check', tail: 0 }
    const changed =
      field === 'tail'
        ? { ...checked, tail: 1 }
        : {
            ...checked,
            scope: {
              ...scope,
              [field]: field === 'tenant' ? { ...scope.tenant, account: 'other' } : 'other',
            },
          }
    vi.spyOn(f.admission, 'verifyToken').mockResolvedValue({ kind: 'valid', checked: changed })
    expect(await verifyPreparedExecution(captured(f.prepared), () => f.admission)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
  },
)

test('requires a token and preserves a thrown provider fault', async () => {
  const f = await given()
  const { admissionToken: _token, ...missing } = f.prepared
  expect(await verifyPreparedExecution(captured(missing), () => f.admission)).toEqual({
    kind: 'rejected',
    reason: 'admissionMissing',
  })
  const fault = new Error('original provider fault')
  vi.spyOn(f.admission, 'verifyToken').mockRejectedValue(fault)
  await expect(verifyPreparedExecution(captured(f.prepared), () => f.admission)).rejects.toBe(fault)
})
