import { describe, expect, it } from 'vitest'
import { recordKey, type LedgerDomain, type LedgerRecord } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { decodeToolRevision } from '@omne-harness/tool-contract'
import {
  callId,
  ok,
  operationId,
  storeKeyTenantShape as tenant,
  tenantA,
  tenantB,
  type Block,
} from './runtime-values.ts'

const domain: LedgerDomain = { kind: 'call', tenant: tenantA, call: callId('call-1') }
const task: LedgerRecord<Block> = {
  kind: 'task',
  task: {
    kind: 'queue',
    operation: operationId('op-1'),
    state: 'pending',
    diagnostic: null,
    basis: { owner: 'test', record: 'b', revision: '1', digest: 'x' },
  },
}

describe('18 the non-durable store', () => {
  it('18 store: declares no durability, starts every domain at revision 0 and commits by revision', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    expect(store.durability).toBe('none')
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '0', records: [] })
    const commit = {
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put' as const, record: task }],
    }
    expect(await store.commit(commit)).toEqual({ kind: 'committed' })
    expect(await store.commit(commit)).toEqual({ kind: 'conflict', current: '1' })
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '1', records: [task] })
    const removal = {
      ...commit,
      expected: '1' as never,
      revision: '2' as never,
      writes: [{ kind: 'delete' as const, key: recordKey(task) }],
    }
    expect(await store.commit(removal)).toEqual({ kind: 'committed' })
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '2', records: [] })
  })

  it('18 store: a commit sets the domain revision whatever it writes: an exclusion alone, or nothing', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    const exclusion: LedgerRecord<Block> = {
      kind: 'exclusion',
      exclusion: { operation: operationId('op-1'), revision: '1' as never },
    }
    const fence = {
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put' as const, record: exclusion }],
    }
    expect(await store.commit(fence)).toEqual({ kind: 'committed' })
    expect(await store.read(domain)).toEqual({
      kind: 'complete',
      revision: '1',
      records: [exclusion],
    })
    expect(recordKey(exclusion)).toBe('exclusion:op-1')
    // A commit prepared against revision 0 fails after the fence.
    expect(await store.commit({ ...fence, writes: [{ kind: 'put', record: task }] })).toEqual({
      kind: 'conflict',
      current: '1',
    })
    // A commit that changes no record still advances the revision.
    const empty = { domain, expected: '1' as never, revision: '2' as never, writes: [] }
    expect(await store.commit(empty)).toEqual({ kind: 'committed' })
    expect(await store.read(domain)).toMatchObject({ revision: '2', records: [exclusion] })
    // A delete of a key that holds no record is a no-op that still advances the revision.
    const absent = {
      ...empty,
      expected: '2' as never,
      revision: '3' as never,
      writes: [{ kind: 'delete' as const, key: recordKey(task) }],
    }
    expect(await store.commit(absent)).toEqual({ kind: 'committed' })
    expect(await store.read(domain)).toEqual({
      kind: 'complete',
      revision: '3',
      records: [exclusion],
    })
  })

  it('18 store: domains of different tenants and calls do not share records', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    await store.commit({
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put', record: task }],
    })
    const other: LedgerDomain = { kind: 'call', tenant: tenantB, call: callId('call-1') }
    expect(await store.read(other)).toEqual({ kind: 'complete', revision: '0', records: [] })
    expect(await store.read({ ...domain, call: callId('call-2') })).toMatchObject({ revision: '0' })
  })

  it.each([
    {
      kind: 'queue',
      first: { kind: 'queue-counter', counter: { next: '11' } },
      second: { kind: 'queue-counter', counter: { next: '22' } },
    },
    {
      kind: 'host',
      first: { kind: 'host', host: { key: 'entry', value: { marker: 'first' } } },
      second: { kind: 'host', host: { key: 'entry', value: { marker: 'second' } } },
    },
  ] satisfies readonly {
    kind: 'queue' | 'host'
    first: LedgerRecord<Block>
    second: LedgerRecord<Block>
  }[])(
    '18 store: $kind domains with different keys keep separate records and revisions',
    async ({ kind, first, second }) => {
      const store = createMemoryToolLedgerStore<Block>()
      const left: LedgerDomain = { kind, tenant: tenantA, key: 'left' }
      const right: LedgerDomain = { kind, tenant: tenantA, key: 'right' }
      const zero = ok(decodeToolRevision('0'))
      const one = ok(decodeToolRevision('1'))
      expect(
        await store.commit({
          domain: left,
          expected: zero,
          revision: one,
          writes: [{ kind: 'put', record: first }],
        }),
      ).toEqual({ kind: 'committed' })
      expect(await store.read(right)).toEqual({ kind: 'complete', revision: '0', records: [] })
      expect(
        await store.commit({
          domain: right,
          expected: zero,
          revision: one,
          writes: [{ kind: 'put', record: second }],
        }),
      ).toEqual({ kind: 'committed' })
      expect(await store.read(left)).toEqual({ kind: 'complete', revision: '1', records: [first] })
      expect(await store.read(right)).toEqual({
        kind: 'complete',
        revision: '1',
        records: [second],
      })
    },
  )

  it('18 store: equal identity text in call, queue and host domains does not share state', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    const entries = [
      { domain: { kind: 'call', tenant: tenantA, call: callId('shared') }, record: task },
      {
        domain: { kind: 'queue', tenant: tenantA, key: 'shared' },
        record: { kind: 'queue-counter', counter: { next: '11' } },
      },
      {
        domain: { kind: 'host', tenant: tenantA, key: 'shared' },
        record: { kind: 'host', host: { key: 'entry', value: { marker: 'host' } } },
      },
    ] satisfies readonly { domain: LedgerDomain; record: LedgerRecord<Block> }[]
    for (const { domain, record } of entries) {
      expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '0', records: [] })
      expect(
        await store.commit({
          domain,
          expected: ok(decodeToolRevision('0')),
          revision: ok(decodeToolRevision('1')),
          writes: [{ kind: 'put', record }],
        }),
      ).toEqual({ kind: 'committed' })
    }
    for (const { domain, record } of entries)
      expect(await store.read(domain)).toEqual({
        kind: 'complete',
        revision: '1',
        records: [record],
      })
  })

  it('18 store: a read gives copies, so a caller cannot change what is stored', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    await store.commit({
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put', record: task }],
    })
    const read = await store.read(domain)
    if (read.kind !== 'complete') throw new Error('read failed')
    const first = read.records[0]
    if (first?.kind !== 'task') throw new Error('not the task')
    Object.assign(first.task, { state: 'blocked' })
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '1', records: [task] })
  })

  it('18 store: injected faults are consumed in order and counted', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    store.injectRead('unavailable')
    store.injectCommit('unavailable', 'unknown-dropped')
    expect(await store.read(domain)).toEqual({ kind: 'unavailable', diagnostic: 'injected' })
    const commit = {
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put' as const, record: task }],
    }
    expect(await store.commit(commit)).toEqual({ kind: 'unavailable', diagnostic: 'injected' })
    expect(await store.commit(commit)).toEqual({ kind: 'unknown', diagnostic: 'injected: dropped' })
    expect(await store.read(domain)).toMatchObject({ revision: '0' })
    expect(await store.commit(commit)).toEqual({ kind: 'committed' })
    expect({ reads: store.reads, commits: store.commits }).toEqual({ reads: 2, commits: 3 })
  })

  it('18 store: an injected conflict writes nothing and the next commit is ordinary', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    store.injectCommit('conflict')
    const commit = {
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put' as const, record: task }],
    }
    expect(await store.commit(commit)).toEqual({ kind: 'conflict', current: '0' })
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '0', records: [] })
    expect(await store.commit(commit)).toEqual({ kind: 'committed' })
  })

  it('18 store: a delayed commit answers unknown and lands later only if its revision still holds', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    const commit = {
      domain,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put' as const, record: task }],
    }
    store.injectCommit('unknown-delayed')
    expect(await store.commit(commit)).toEqual({ kind: 'unknown', diagnostic: 'injected: delayed' })
    expect(await store.read(domain)).toMatchObject({ revision: '0', records: [] })
    expect(store.landDelayed()).toEqual([{ kind: 'committed' }])
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '1', records: [task] })
    expect(store.landDelayed()).toEqual([])
    // A held commit whose expected revision has moved on is dropped when it lands.
    store.injectCommit('unknown-delayed')
    await store.commit({ ...commit, writes: [{ kind: 'delete', key: recordKey(task) }] })
    await store.commit({ ...commit, expected: '1' as never, revision: '2' as never, writes: [] })
    expect(store.landDelayed()).toEqual([{ kind: 'conflict' }])
    expect(await store.read(domain)).toEqual({ kind: 'complete', revision: '2', records: [task] })
  })

  it('18 store: a call identity that contains the separator does not reach another domain', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    const slash: LedgerDomain = { kind: 'call', tenant: tenantA, call: callId('x/call-1') }
    await store.commit({
      domain: slash,
      expected: '0' as never,
      revision: '1' as never,
      writes: [{ kind: 'put', record: task }],
    })
    const other: LedgerDomain = {
      kind: 'call',
      tenant: tenant('org_a', 'acc_a/x'),
      call: callId('call-1'),
    }
    expect(await store.read(other)).toEqual({ kind: 'complete', revision: '0', records: [] })
  })
  it('18 store: a rejected copy preserves every record and the revision', async () => {
    const store = createMemoryToolLedgerStore<Block>()
    const host: LedgerDomain = { kind: 'host', tenant: tenantA, key: 'atomic-copy' }
    const kept: LedgerRecord<Block> = { kind: 'host', host: { key: 'kept', value: { n: 1 } } }
    const removed: LedgerRecord<Block> = { kind: 'host', host: { key: 'removed', value: [2] } }
    const next = {
      kind: 'host',
      host: { key: 'next', value: { n: 3 } },
    } satisfies LedgerRecord<Block>
    await store.commit({
      domain: host,
      expected: ok(decodeToolRevision('0')),
      revision: ok(decodeToolRevision('1')),
      writes: [kept, removed].map(record => ({ kind: 'put', record })),
    })
    const before = await store.read(host)
    let failure: unknown
    try {
      await store.commit({
        domain: host,
        expected: ok(decodeToolRevision('1')),
        revision: ok(decodeToolRevision('2')),
        writes: [
          { kind: 'delete', key: recordKey(removed) },
          { kind: 'put', record: next },
          { kind: 'put', record: { kind: 'host', host: { key: 'bad', value: () => null } } },
        ],
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(await store.read(host)).toEqual(before)
    expect(
      await store.commit({
        domain: host,
        expected: ok(decodeToolRevision('1')),
        revision: ok(decodeToolRevision('2')),
        writes: [
          { kind: 'delete', key: recordKey(removed) },
          { kind: 'put', record: next },
        ],
      }),
    ).toEqual({ kind: 'committed' })
    expect(await store.read(host)).toEqual({
      kind: 'complete',
      revision: '2',
      records: [kept, next],
    })
  })
})
