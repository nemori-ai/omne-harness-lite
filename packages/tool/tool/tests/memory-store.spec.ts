import { describe, expect, it } from 'vitest'
import { recordKey, type LedgerDomain, type LedgerRecord } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { callId, operationId, tenantA, tenantB, type Block } from './runtime-values.ts'

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
})
