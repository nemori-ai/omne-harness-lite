import type { WorkSnapshot } from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { describe, expect, it } from 'vitest'
import { canonicalText, encodeValue } from '../src/codec.ts'
import { createSessionStorage } from '../src/index.ts'
import { app, textOf, TENANT_A } from './fixtures/app.ts'
import { startRun } from './fixtures/real-provider.ts'

const SESSION = 'session-1'
const binding = {
  producer: { kind: 'tool' as const, call: 'outside-call' },
  action: 'external-action',
  consumer: { owner: 'external', work: 'work', position: 'original', purpose: 'action' },
  request: evidence('request'),
  initiatingAttempt: null,
}
const result = {
  producer: binding.producer,
  version: '1',
  delivery: 'delivery',
  source: evidence('result'),
}

const ok = <T>(answer: unknown): T => {
  expect(answer, JSON.stringify(answer)).toHaveProperty('ok')
  return (answer as { ok: T }).ok
}

async function scene() {
  const a = await app()
  ok(await a.create(TENANT_A))
  ok(await a.accept(TENANT_A, SESSION, 'input-1'))
  ok(await startRun(a, 'start-run-1'))
  const access = a.access(TENANT_A)
  const read = async (): Promise<WorkSnapshot> => ok(await a.port.readWork(access))
  // A port with a cache of its own: its first read is a whole read of the store.
  const whole = async (): Promise<WorkSnapshot> =>
    ok(
      await createSessionStorage<string>({
        ...a.storageOptions,
        storage: { ...a.provider.storage, database: {} },
      }).readWork(access),
    )
  const commit = (command: Record<string, unknown>) =>
    a.port.commit({ access, guards: [], command: command as never })
  const bind = async (operation: string) =>
    commit({
      kind: 'bindExternalCall',
      input: {
        ...access,
        operation: operationId(operation),
        expected: (await read()).revision,
        binding,
        qualification: evidence('qualified'),
      },
    })
  const consumption = ok<{ consumption: string }>(await bind('bind')).consumption
  const preserve = (operation: string, custody = evidence('custody')) =>
    commit({
      kind: 'preserveResult',
      input: {
        ...access,
        operation: operationId(operation),
        consumption,
        result,
        custody,
        participation: null,
      },
    })
  const process = async (operation: string) =>
    commit({
      kind: 'completeExternalConsumption',
      input: {
        ...access,
        operation: operationId(operation),
        expected: (await read()).revision,
        qualification: evidence('qualified'),
        completion: {
          consumption,
          result,
          position: 'original',
          processing: evidence('processed'),
          message: null,
        },
      },
    })
  const release = (operation: string) =>
    commit({
      kind: 'receive',
      input: {
        ...access,
        operation: operationId(operation),
        fact: { kind: 'release', consumption, result, source: evidence('released') },
      },
    })
  const rows = (table: string): number =>
    Number(
      (
        a.provider.select(
          'dom_0',
          `SELECT COUNT(*) FROM ${table} WHERE tenant = ? AND session = ?`,
          [textOf(TENANT_A), SESSION],
        ).rows as unknown as [[bigint]]
      )[0][0],
    )
  const reads = (handler: string, from: number): number =>
    a.provider.calls.slice(from).filter(call => call.kind === 'read' && call.handler === handler)
      .length
  // The snapshot the cache holds after a commit of this process is the one a whole read answers.
  const folded = async (commit: () => Promise<unknown>) => {
    await read()
    ok(await commit())
    const from = a.provider.calls.length
    const held = await read()
    expect(reads('session.work', from)).toBe(0)
    expect(canonicalText(encodeValue(held))).toBe(canonicalText(encodeValue(await whole())))
  }
  const call = (producer = binding.producer) => a.port.readCall({ ...access, producer })
  return {
    a,
    read,
    whole,
    bind,
    consumption,
    preserve,
    process,
    release,
    rows,
    reads,
    folded,
    call,
  }
}

const holds = (snapshot: WorkSnapshot, consumption: string): boolean =>
  snapshot.consumptions.some(item => item.id === consumption) ||
  (snapshot.callRegistrations ?? []).some(item => item.consumption === consumption) ||
  (snapshot.workEntryIndex?.calls ?? []).some(item => item.consumption === consumption)

describe('the stored work snapshot holds the open calls', () => {
  it('a processed call leaves the snapshot of the store and of the cache, and one row keeps it', async () => {
    const s = await scene()
    ok(await s.preserve('preserve'))
    expect(holds(await s.whole(), s.consumption)).toBe(true)
    expect(s.rows('sl_call_left')).toBe(0)
    ok(await s.process('process'))
    expect(holds(await s.whole(), s.consumption)).toBe(false)
    expect(holds(await s.read(), s.consumption)).toBe(false)
    expect(s.rows('sl_call_left')).toBe(1)
  })
})

describe('a fact about a call that left the stored snapshot', () => {
  it('a late release is written once under the call, and the call stays out', async () => {
    const s = await scene()
    ok(await s.preserve('preserve'))
    ok(await s.process('process'))
    ok(await s.release('release'))
    expect(holds(await s.whole(), s.consumption)).toBe(false)
    expect([s.rows('sl_call_left'), s.rows('sl_call_late')]).toEqual([1, 1])
    ok(await s.release('release-again'))
    expect([s.rows('sl_call_left'), s.rows('sl_call_late')]).toEqual([1, 1])
  })

  it('the same custody again is the original one; another custody is a conflict', async () => {
    const s = await scene()
    ok(await s.preserve('preserve'))
    ok(await s.process('process'))
    ok(await s.preserve('preserve-again'))
    expect(await s.preserve('preserve-other', evidence('another-custody'))).toMatchObject({
      failure: { kind: 'conflict' },
    })
    expect(s.rows('sl_call_late')).toBe(0)
  })

  it('the same binding bound again answers the original consumption and opens nothing', async () => {
    const s = await scene()
    ok(await s.process('process'))
    expect(ok<{ consumption: string }>(await s.bind('bind-again')).consumption).toBe(s.consumption)
    expect(holds(await s.whole(), s.consumption)).toBe(false)
    expect(s.rows('sl_call_left')).toBe(1)
  })
})

describe('the cache follows the store through a call that leaves', () => {
  it('folds the batch that lets the call leave, and the late facts after it, without a whole read', async () => {
    const s = await scene()
    await s.folded(() => s.preserve('preserve'))
    await s.folded(() => s.process('process'))
    expect(holds(await s.read(), s.consumption)).toBe(false)
    const from = s.a.provider.calls.length
    await s.folded(() => s.release('release'))
    expect(s.reads('session.calls-left', from)).toBe(1)
    await s.folded(() => s.bind('bind-again'))
  })
})

describe('the binding of a producer, asked from the store', () => {
  it('is the same while the call is in the snapshot and after it left; another producer has none', async () => {
    const s = await scene()
    const bound = { consumption: s.consumption, binding }
    expect(ok(await s.call())).toEqual(bound)
    ok(await s.process('process'))
    expect(holds(await s.read(), s.consumption)).toBe(false)
    expect(ok(await s.call())).toEqual(bound)
    expect(ok(await s.call({ kind: 'tool', call: 'never-bound' }))).toBeNull()
  })
})
