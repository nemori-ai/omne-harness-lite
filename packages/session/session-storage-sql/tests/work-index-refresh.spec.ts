// A publication of the Agent records of this process without a Session participation in its
// commit replaces only the index of the held snapshot (`registerSessionWorkIndex` without `work`,
// C-TOPOLOGY §2.9.2). It replaces it only when the cache holds a snapshot and the count moved past
// the held one, once per version (flight); a store at another tail registers nothing (stale); a
// count that moved on during the index read is registered with the index read at it (P-4). The
// cases drive the public entry the Journal provider calls and count the handler reads the storage
// served and the fold counts of this process.
import type { WorkSnapshot } from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import type { DomainRef, SqlStorage } from '@omne-harness/sql-contract'
import { describe, expect, it } from 'vitest'
import { canonicalText, encodeValue } from '../src/codec.ts'
import { createSessionStorage } from '../src/index.ts'
import { registerSessionWorkIndex } from '../src/participants.ts'
import { workFoldCounts, type WorkFoldCounts } from '../src/work-cache.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  eventOf,
  startRun,
} from './fixtures/real-provider.ts'

type Port = App['port']

const WHOLE = 'session.work'
const INDEX = 'session.work-index'
const SESSION = 'session-1'
const DOMAIN: DomainRef = {
  scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
  transactionDomain: 'dom_0',
}

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

/** The reads of `handler` the storage served since `from` (an index into the call log). */
const readsOf = (a: App, handler: string, from: number): number =>
  a.provider.calls.slice(from).filter(call => call.kind === 'read' && call.handler === handler)
    .length

/** The change of the fold counts of the database behind `storage` since `before`. */
function since(storage: SqlStorage, before: WorkFoldCounts): WorkFoldCounts {
  const now = workFoldCounts(storage)
  return {
    folded: now.folded - before.folded,
    indexed: now.indexed - before.indexed,
    skipped: now.skipped - before.skipped,
    quarantined: now.quarantined - before.quarantined,
    stale: now.stale - before.stale,
    republished: now.republished - before.republished,
  }
}
const none: WorkFoldCounts = {
  folded: 0,
  indexed: 0,
  skipped: 0,
  quarantined: 0,
  stale: 0,
  republished: 0,
}

/**
 * A port over a storage object of its own (a work cache of its own). `hooks` run once, before the
 * read of their handler goes to the storage.
 */
function portOver(a: App) {
  const hooks = new Map<string, () => Promise<void> | void>()
  const storage: SqlStorage = {
    registerCombination: input => a.provider.storage.registerCombination(input),
    commit: request => a.provider.storage.commit(request),
    query: identity => a.provider.storage.query(identity),
    read: async (request, options) => {
      const hook = hooks.get(request.handler)
      if (hook !== undefined) {
        hooks.delete(request.handler)
        await hook()
      }
      return a.provider.storage.read(request, options)
    },
  } as SqlStorage
  return { port: createSessionStorage<string>({ ...a.storageOptions, storage }), storage, hooks }
}

const readWork = async (port: Port, a: App): Promise<WorkSnapshot> =>
  ok<WorkSnapshot>(await port.readWork(a.access(TENANT_A)))

/** The answer of a whole read: a new port instance has an empty cache. */
const wholeRead = (a: App): Promise<WorkSnapshot> => readWork(portOver(a).port, a)

const sameAnswer = (left: WorkSnapshot, right: WorkSnapshot): void =>
  expect(canonicalText(encodeValue(left))).toBe(canonicalText(encodeValue(right)))

/** The publication count of the Agent records of the session, as the store has it now. */
function publishedOf(a: App): string {
  const [[published]] = a.provider.select(
    'dom_0',
    'SELECT published FROM er_root WHERE tenant = ? AND session = ?',
    [textOf(TENANT_A), SESSION],
  ).rows as unknown as [[bigint | number | string]]
  return String(published)
}

/** What the Journal provider calls after a publication that carried no Session participation. */
const register = (storage: SqlStorage, published: string): Promise<void> =>
  registerSessionWorkIndex(storage, DOMAIN, textOf(TENANT_A), SESSION, published)

/** A session with a running Run on `input-1` and `input-2` pending, and the publisher of its Agent. */
async function scene() {
  const a = await app()
  const agent = agentPublisher({
    storage: a.provider.storage,
    combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
    domainOf: () => 'dom_0',
  })
  ok(await a.create(TENANT_A))
  ok(await a.accept(TENANT_A, SESSION, 'input-1'))
  ok(await startRun(a, 'start-run-1'))
  ok(await a.accept(TENANT_A, SESSION, 'input-2'))
  const run = activeRun(await readWork(a.port, a))
  /** One publication that changes the index: the Agent admitted `input-2` to the Run's attempt. */
  const admit = () =>
    agent.admit({
      tenant: TENANT_A,
      session: SESSION,
      execution: run.execution,
      input: 'input-2',
      operation: 'aop-submit-2',
      accepted: evidence('agent/accepted/2'),
      grant: evidence('agent/receipt/2'),
      attachment: 'attachment-1',
      attempt: run.attempt,
    })
  /** One publication that leaves the index as it was: an observed event of the execution. */
  const observe = () => agent.publish(agentEventOf(eventOf(run, 1, [], 'unused'), ['observed']))
  return { a, run, admit, observe }
}

const membersOf = (snapshot: WorkSnapshot): readonly (string | undefined)[] | undefined =>
  snapshot.historyIndex?.inputs
    .find(item => item.input === 'input-2')
    ?.members.map(item => item.attempt)

describe('the index of the held snapshot is replaced after a publication', () => {
  it('replaces it: the next read reads no whole snapshot, and its answer is a whole read at the count', async () => {
    const { a, run, admit } = await scene()
    await readWork(a.port, a)
    await admit()
    const before = workFoldCounts(a.provider.storage)
    await register(a.provider.storage, publishedOf(a))
    expect(since(a.provider.storage, before)).toEqual({ ...none, indexed: 1 })
    const from = a.provider.calls.length
    const held = await readWork(a.port, a)
    expect(readsOf(a, WHOLE, from)).toBe(0)
    expect(membersOf(held)).toEqual([run.attempt])
    sameAnswer(held, await wholeRead(a))
  })

  it('a count equal to the held one replaces nothing', async () => {
    const { a, admit } = await scene()
    await readWork(a.port, a)
    await admit()
    const published = publishedOf(a)
    await register(a.provider.storage, published)
    const before = workFoldCounts(a.provider.storage)
    await register(a.provider.storage, published)
    expect(since(a.provider.storage, before)).toEqual({ ...none, skipped: 1 })
  })

  it('no held snapshot: nothing is registered, and the next read is whole', async () => {
    const { a, admit } = await scene()
    await admit()
    const { port, storage } = portOver(a)
    const before = workFoldCounts(storage)
    await register(storage, publishedOf(a))
    expect(since(storage, before)).toEqual({ ...none, skipped: 1 })
    const from = a.provider.calls.length
    await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
  })

  it('a replacement of the same version in flight: the repeated call skips', async () => {
    const { a, run, admit } = await scene()
    const { port, storage, hooks } = portOver(a)
    await readWork(port, a)
    await admit()
    const published = publishedOf(a)
    let entered: () => void = () => undefined
    const reading = new Promise<void>(resolve => (entered = resolve))
    let release: () => void = () => undefined
    const gate = new Promise<void>(resolve => (release = resolve))
    hooks.set(INDEX, async () => {
      entered()
      await gate
    })
    const before = workFoldCounts(storage)
    const first = register(storage, published)
    await reading
    await register(storage, published)
    expect(since(storage, before)).toEqual({ ...none, skipped: 1 })
    release()
    await first
    expect(since(storage, before)).toEqual({ ...none, skipped: 1, indexed: 1 })
    const from = a.provider.calls.length
    const held = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(0)
    expect(membersOf(held)).toEqual([run.attempt])
  })

  it('the store is at another tail at the index read: nothing is registered, and the next read is whole', async () => {
    const { a, admit } = await scene()
    const { port, storage, hooks } = portOver(a)
    const other = portOver(a)
    await readWork(port, a)
    await admit()
    const published = publishedOf(a)
    hooks.set(INDEX, async () => {
      ok(
        await other.port.commit({
          access: a.access(TENANT_A),
          command: {
            kind: 'accept',
            input: {
              tenant: TENANT_A,
              session: sessionId(SESSION),
              operation: operationId('accept-other'),
              value: ordinaryInput('input-other'),
            },
          },
          guards: [],
        }),
      )
    })
    const before = workFoldCounts(storage)
    await register(storage, published)
    expect(since(storage, before)).toEqual({ ...none, stale: 1 })
    const from = a.provider.calls.length
    const after = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(1)
    expect(after.pending).toContain('input-other')
  })

  it('the count moves on during the index read: the answer is registered at that count (P-4)', async () => {
    const { a, run, admit, observe } = await scene()
    const { port, storage, hooks } = portOver(a)
    await readWork(port, a)
    await observe()
    const asked = publishedOf(a)
    // A second publication between the call and the index read: it admits `input-2`.
    hooks.set(INDEX, admit)
    const before = workFoldCounts(storage)
    await register(storage, asked)
    expect(publishedOf(a)).not.toBe(asked)
    expect(since(storage, before)).toEqual({ ...none, indexed: 1, republished: 1 })
    const from = a.provider.calls.length
    const held = await readWork(port, a)
    expect(readsOf(a, WHOLE, from)).toBe(0)
    expect(membersOf(held)).toEqual([run.attempt])
    sameAnswer(held, await wholeRead(a))
  })
})
