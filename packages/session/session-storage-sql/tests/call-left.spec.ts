import type { WorkSnapshot } from '@omne-harness/session-contract'
import { evidence, operationId } from '@omne-harness/session-contract/testing'
import { describe, expect, it } from 'vitest'
import { canonicalText, encodeValue } from '../src/codec.ts'
import { createSessionStorage } from '../src/index.ts'
import { callsLeft } from '../src/worker/call-left.ts'
import readCallsLeft from '../src/worker/read-calls-left.ts'
import { app, textOf, TENANT_A } from './fixtures/app.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  cancelRun,
  eventOf,
  startRun,
} from './fixtures/real-provider.ts'

const SESSION = 'session-1'
const CALLS_LEFT = 'session.calls-left'
const WHOLE = 'session.work'
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
  const fresh = () =>
    createSessionStorage<string>({
      ...a.storageOptions,
      storage: { ...a.provider.storage, database: {} },
    })
  const whole = async (): Promise<WorkSnapshot> => ok(await fresh().readWork(access))
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
  const asked = (from: number) =>
    a.provider.calls
      .slice(from)
      .flatMap(item => (item.kind === 'read' && item.handler === CALLS_LEFT ? [item.input] : []))
  const slots = () =>
    (
      a.provider.select(
        'dom_0',
        'SELECT slot FROM sl_call_late WHERE tenant = ? AND session = ? ORDER BY slot',
        [textOf(TENANT_A), SESSION],
      ).rows as unknown as [string][]
    ).map(([slot]) => slot)
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
    fresh,
    access,
    asked,
    slots,
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
    expect(s.slots()).toEqual(['release/1'])
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

describe('what the cache asks about the calls that left', () => {
  it('a batch that names only calls of the held snapshot asks nothing', async () => {
    const s = await scene()
    await s.read()
    const from = s.a.provider.calls.length
    ok(await s.preserve('preserve'))
    await s.read()
    expect(s.asked(from)).toEqual([])
  })

  it('a batch that names a call that left asks once, as the store was before the batch', async () => {
    const s = await scene()
    ok(await s.preserve('preserve'))
    ok(await s.process('process'))
    const before = (await s.read()).revision
    const from = s.a.provider.calls.length
    ok(await s.release('release'))
    await s.read()
    expect(s.asked(from)).toMatchObject([{ through: before }])
  })

  it('a failed read of the calls that left gives the fold up: the next read is whole and right', async () => {
    const s = await scene()
    ok(await s.preserve('preserve'))
    ok(await s.process('process'))
    await s.read()
    s.a.provider.failReads(CALLS_LEFT)
    const from = s.a.provider.calls.length
    ok(await s.release('release'))
    const held = await s.read()
    s.a.provider.failReads(null)
    expect(s.reads(WHOLE, from)).toBe(1)
    expect(canonicalText(encodeValue(held))).toBe(canonicalText(encodeValue(await s.whole())))
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

  it('a store that cannot be read answers its failure, never that there is no such call', async () => {
    const s = await scene()
    ok(await s.process('process'))
    s.a.provider.failReads(CALLS_LEFT)
    expect(await s.call()).toHaveProperty('failure.kind', 'unavailable')
    s.a.provider.failReads(WHOLE)
    const unread = await s.fresh().readCall({ ...s.access, producer: binding.producer })
    s.a.provider.failReads(null)
    expect(unread).toHaveProperty('failure.kind', 'unavailable')
    expect(ok(await s.call())).toEqual({ consumption: s.consumption, binding })
  })
})

describe('the read of the calls that left refuses an input it cannot read', () => {
  it('without a session, without keys, or with a position that is not a count', () => {
    const port = {
      execute: () => {
        throw new Error('nothing is read for a refused input')
      },
    }
    const keys = encodeValue({ consumptions: [], producers: [] })
    const scope = { tenant: textOf(TENANT_A), session: SESSION }
    for (const input of [
      { tenant: scope.tenant, keys, through: '1' },
      { ...scope, through: '1' },
      { ...scope, keys },
      { ...scope, keys, through: '-1' },
      { ...scope, keys, through: 'one' },
    ])
      expect(() => readCallsLeft.read(input as never, port as never)).toThrow('invalid input')
  })
})

describe('an intent that left the stored snapshot and is associated afterwards', () => {
  it('one row keeps the intent, one row the association; the producer answers the binding, cache and store agree', async () => {
    const s = await scene()
    const agent = agentPublisher({
      storage: s.a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    const commitLog = s.a.port.commitLog
    if (commitLog === undefined) throw new Error('the SQL port offers no commitLog')
    const run = activeRun(await s.read())
    const consumption = 'intent-consumption'
    const fields = {
      action: 'tool-action',
      consumer: { owner: 'agent', work: 'work', position: 'position', purpose: 'action' },
      request: evidence('intent/request'),
      initiatingAttempt: run.attempt,
    }
    const interpret = async (n: number, consequence: Record<string, unknown>) => {
      const event = eventOf(run, n, [{ consumption, ...consequence } as never], `log-${String(n)}`)
      await agent.publish(agentEventOf(event))
      return commitLog({ observation: event })
    }
    ok(
      await interpret(1, {
        kind: 'call-registration',
        registration: { kind: 'tool-intent', ...fields, purpose: 'action' },
      }),
    )
    expect(holds(await s.whole(), consumption)).toBe(true)
    ok(await cancelRun(s.a, run.run, 'cancel'))
    expect(holds(await s.whole(), consumption)).toBe(false)
    const invoked = { producer: { kind: 'tool' as const, call: 'real-invocation' }, ...fields }
    expect(ok(await s.call(invoked.producer))).toBeNull()
    expect([s.rows('sl_call_left'), s.rows('sl_call_late')]).toEqual([1, 0])
    await s.read()
    ok(
      await interpret(2, {
        kind: 'call-association',
        binding: invoked,
        source: evidence('intent/association'),
      }),
    )
    expect([s.rows('sl_call_left'), s.rows('sl_call_late')]).toEqual([1, 1])
    expect(s.slots()).toEqual(['association'])
    const held = await s.read()
    expect(holds(held, consumption)).toBe(false)
    expect(canonicalText(encodeValue(held))).toBe(canonicalText(encodeValue(await s.whole())))
    expect(ok(await s.call(invoked.producer))).toEqual({ consumption, binding: invoked })
    ok(
      await s.a.port.commit({
        access: s.access,
        guards: [],
        command: {
          kind: 'preserveResult',
          input: {
            ...s.access,
            operation: operationId('preserve-invoked'),
            consumption,
            result: { ...result, producer: invoked.producer },
            custody: evidence('custody-invoked'),
            participation: null,
          },
        } as never,
      }),
    )
    expect(s.slots()).toEqual(['association', 'custody/1', 'result/1'])
    // The slots are read a page at a time, in the order they were written: no number of them fails the read.
    const port = {
      execute: (sql: string, params: readonly unknown[]) =>
        s.a.provider.select('dom_0', sql, params as never),
    }
    const scope = { tenant: textOf(TENANT_A), session: SESSION }
    const keys = { consumptions: [consumption], producers: [] }
    const [paged] = callsLeft(port as never, scope, null, 1)(keys as never)
    expect(paged?.consumed?.results.map(item => item.custody?.digest)).toEqual([
      evidence('custody-invoked').digest,
    ])
    expect(callsLeft(port as never, scope, null, 2)(keys as never)).toEqual([paged])
    expect(callsLeft(port as never, scope)(keys as never)).toEqual([paged])
  })
})
