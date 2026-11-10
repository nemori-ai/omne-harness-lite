import { describe, expect, it } from 'vitest'
import { sessionIntakeLimits, type SessionCommand } from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  memoryAccess,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { initializationGuards } from './initialization-fixture.ts'

const access = memoryAccess('intake-test')
const base = { tenant: access.tenant, session: access.session }
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8')

async function scene(
  maxPendingInputs = 2,
  maxInputBytes = 4096,
  initial: ReturnType<typeof ordinaryInput> | null = null,
) {
  const initialization = createMemoryInitializationSource()
  const limits = { maxPendingInputs, maxInputBytes }
  let allowed = true
  const port = createMemorySessionTransactions({
    initialization,
    history: createMemorySessionHistorySource(),
    accessCheck: createPolicySessionAccessCheck(() =>
      allowed ? { kind: 'allowed', evidence: evidence('access') } : { kind: 'denied' },
    ),
    intakeLimits: limits,
  })
  const command = {
    kind: 'create',
    input: { ...base, operation: operationId('create'), creation: creation({ initial }) },
  } satisfies SessionCommand
  const guards = initializationGuards(command, null)
  const material = guards[0]
  if (material === undefined) throw new Error('missing initialization fixture')
  initialization.controls.register(command, material)
  const prepared = succeeded(await initialization.prepare(command), 'prepare')
  const created = await port.commit({ access, command, guards: prepared })
  const accept = (name: string, value = ordinaryInput(name)) =>
    port.commit({
      access,
      guards: [],
      command: { kind: 'accept', input: { ...base, operation: operationId(name), value } },
    })
  return {
    port,
    accept,
    created,
    limits,
    revoke: () => {
      allowed = false
    },
  }
}

describe('ordinary input admission', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid deployment budget %s',
    value => {
      expect(() => sessionIntakeLimits({ maxPendingInputs: value, maxInputBytes: 1024 })).toThrow(
        TypeError,
      )
      expect(() => sessionIntakeLimits({ maxPendingInputs: 1, maxInputBytes: value })).toThrow(
        TypeError,
      )
    },
  )
  it('accepts concurrent distinct inputs in commit order and refuses excess without losing custody', async () => {
    const s = await scene()
    succeeded(s.created, 'create')
    const results = await Promise.all(['one', 'two', 'three'].map(name => s.accept(name)))
    expect(results[2]).toEqual({
      failure: { kind: 'limited', resource: 'pending-inputs', limit: 2 },
    })
    const state = succeeded(await s.port.readWork(access), 'read')
    expect(state.pending).toEqual([ordinaryInput('one').input, ordinaryInput('two').input])
    const [first, second] = results
    if (first === undefined || second === undefined) throw new Error('missing concurrent receipts')
    expect(succeeded(first, 'first').revision).not.toBe(succeeded(second, 'second').revision)
    expect(succeeded(await s.accept('one'), 'recall').recovered).toBe(true)
    expect(await s.accept('one', ordinaryInput('one', 'different'))).toEqual({
      failure: { kind: 'conflict', operation: operationId('one') },
    })
    s.revoke()
    expect(await s.accept('one')).toMatchObject({ failure: { kind: 'denied' } })
    expect(await s.port.queryOperation({ ...access, operation: operationId('one') })).toMatchObject(
      { failure: { kind: 'denied' } },
    )
  })

  it('counts actual UTF-8 bytes, includes equality, and limits the initial input too', async () => {
    const value = ordinaryInput('unicode', '你好😀')
    const limit = bytes(value)
    expect(limit).toBeGreaterThan(JSON.stringify(value).length)
    const exact = await scene(2, limit)
    succeeded(await exact.accept('unicode', value), 'exact byte boundary')
    const over = await scene(2, limit - 1)
    expect(await over.accept('unicode', value)).toEqual({
      failure: { kind: 'limited', resource: 'input-bytes', limit: limit - 1 },
    })
    expect(succeeded(await over.port.readWork(access), 'read').pending).toEqual([])
    const initial = await scene(2, limit - 1, value)
    expect(initial.created).toEqual({
      failure: { kind: 'limited', resource: 'input-bytes', limit: limit - 1 },
    })
  })

  it('fixes configuration at construction and does not let callers raise it afterwards', async () => {
    const s = await scene(1)
    s.limits.maxPendingInputs = 100
    succeeded(await s.accept('one'), 'first')
    expect(await s.accept('two')).toMatchObject({ failure: { kind: 'limited', limit: 1 } })
  })

  it('releases capacity on Agent handover and keeps card routing and controls available at capacity', async () => {
    const s = await scene(1)
    succeeded(await s.accept('one'), 'first')
    const started = succeeded(
      await s.port.commit({
        access,
        guards: [],
        command: {
          kind: 'startRun',
          input: {
            ...base,
            operation: operationId('start'),
            entry: 'interactive',
            candidate: creation().definition.candidate,
            instance: { owner: 'agent', id: 'first' },
          },
        },
      }),
      'start',
    )
    const active = succeeded(await s.port.readWork(access), 'active')
    if (active.run.kind !== 'active') throw new Error('no active run')
    expect(started.receipt.revision).toBe(active.revision)
    succeeded(
      await s.port.commit({
        access,
        guards: [],
        command: {
          kind: 'receive',
          input: {
            ...base,
            operation: operationId('handover'),
            fact: {
              kind: 'input-handover',
              execution: active.run.execution.execution,
              input: ordinaryInput('one').input,
              result: { kind: 'accepted', receipt: evidence('agent-accepted') },
            },
          },
        },
      }),
      'handover',
    )
    succeeded(await s.accept('two'), 'capacity released')
    expect(await s.accept('three')).toMatchObject({ failure: { kind: 'limited' } })
    succeeded(
      await s.port.commit({
        access,
        guards: [],
        command: {
          kind: 'accept',
          input: {
            ...base,
            operation: operationId('card'),
            value: {
              kind: 'card-decision',
              card: evidence('card'),
              decision: evidence('decision'),
              destination: evidence('destination'),
            },
          },
        },
      }),
      'card does not consume the ordinary queue',
    )
    succeeded(
      await s.port.commit({
        access,
        guards: [],
        command: {
          kind: 'control',
          input: { ...base, operation: operationId('archive'), intent: { kind: 'archive' } },
        },
      }),
      'archive at capacity',
    )
    expect(await s.accept('four')).toMatchObject({ failure: { kind: 'archived' } })
    expect(
      succeeded(
        await s.port.readInput({ ...access, input: ordinaryInput('two').input }),
        'retained input',
      ),
    ).toMatchObject({ input: ordinaryInput('two').input })
  })
})
