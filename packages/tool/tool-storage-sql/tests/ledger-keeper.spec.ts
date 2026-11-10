// The snapshot keeper of the ledger store (SPEC「读用保管的快照作答」; model SnapshotCache). The
// raw store here is the memory store of `@omne-harness/tool/testing` with its round trips counted:
// the keeper does not know SQL.
import { describe, expect, it } from 'vitest'
import {
  recordKey,
  type LedgerCommitInput,
  type LedgerDomain,
  type LedgerRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { keeping, LedgerKeeper, SNAPSHOT_MAX_AGE_MS } from '../src/ledger-keeper.ts'
import { TENANT_A } from './fixtures/app.ts'

function revision(text: string) {
  const decoded = decodeToolRevision(text)
  if ('failure' in decoded) throw new Error('fixture revision is not legal')
  return decoded.ok
}
const DOMAIN: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'kept' }
const OTHER: LedgerDomain = { kind: 'host', tenant: TENANT_A, key: 'other' }
const host = (key: string, value: unknown = key): LedgerRecord => ({
  kind: 'host',
  host: { key, value },
})
const keyOf = (name: string) => recordKey(host(name))

/** The memory store with its round trips counted, a clock, and stores that share one keeper. */
function scene() {
  const memory = createMemoryToolLedgerStore()
  const trips = { read: 0, readRecord: 0, commit: 0 }
  const raw: Pick<ToolLedgerStore, 'read' | 'readRecord' | 'commit'> = {
    read: domain => {
      trips.read += 1
      return memory.read(domain)
    },
    readRecord: (domain, key) => {
      trips.readRecord += 1
      return memory.readRecord(domain, key)
    },
    commit: input => {
      trips.commit += 1
      return memory.commit(input)
    },
  }
  let at = 0
  const keeper = new LedgerKeeper()
  const store = keeping(keeper, raw, () => at)
  let next = 0
  /** Commits `records` at the revision the store has, through `via`. */
  const put = async (via: typeof store, domain: LedgerDomain, ...records: LedgerRecord[]) => {
    const current = await memory.read(domain)
    if (current.kind !== 'complete') throw new Error('fixture read failed')
    next += 1
    const input: LedgerCommitInput = {
      domain,
      expected: current.revision,
      revision: revision(`${100 + next}`),
      writes: records.map(record => ({ kind: 'put', record })),
    }
    return via.commit(input)
  }
  const names = async (domain: LedgerDomain = DOMAIN) => {
    const answer = await store.read(domain)
    if (answer.kind !== 'complete') throw new Error(`read answered ${answer.kind}`)
    return answer.records.map(record => recordKey(record))
  }
  return {
    memory,
    trips,
    raw,
    keeper,
    store,
    put,
    names,
    pass: (ms: number) => {
      at += ms
    },
  }
}

describe('reads after a whole read or a commit', () => {
  it('answer from the snapshot without a round trip', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    expect(await s.names()).toEqual([keyOf('a')])
    const before = { ...s.trips }
    expect(await s.names()).toEqual([keyOf('a')])
    const one = await s.store.readRecord(DOMAIN, keyOf('a'))
    expect(one).toMatchObject({ kind: 'complete', record: host('a') })
    expect(s.trips).toEqual(before)
  })

  it('see every commit that went through the keeper at once, record for record like a cold read', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('b'))
    await s.names()
    await s.put(s.store, DOMAIN, host('a'), host('c', { deep: [1, { x: undefined }] }))
    const current = await s.memory.read(DOMAIN)
    if (current.kind !== 'complete') throw new Error('fixture read failed')
    await s.store.commit({
      domain: DOMAIN,
      expected: current.revision,
      revision: revision('500'),
      writes: [{ kind: 'delete', key: keyOf('c') }],
    })
    const reads = s.trips.read
    const kept = await s.store.read(DOMAIN)
    expect(s.trips.read).toBe(reads)
    // The SQL read answers in key order; the memory store answers in the order of the writes.
    const cold = await s.memory.read(DOMAIN)
    if (cold.kind !== 'complete' || kept.kind !== 'complete') throw new Error('read failed')
    expect(kept.revision).toBe(cold.revision)
    expect(kept.records).toEqual([host('a'), host('b')])
    expect(kept.records).toEqual(
      [...cold.records].sort((left, right) => (recordKey(left) < recordKey(right) ? -1 : 1)),
    )
  })

  it('are shared by every store over the same keeper', async () => {
    const s = scene()
    const second = keeping(s.keeper, s.raw, () => 0)
    await s.put(s.store, DOMAIN, host('a'))
    await s.names()
    await s.put(second, DOMAIN, host('b'))
    const before = { ...s.trips }
    expect(await s.names()).toEqual([keyOf('a'), keyOf('b')])
    expect(s.trips).toEqual(before)
  })
})

describe('the answer "absent"', () => {
  it('for one record is the answer of the store, not of the snapshot', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    await s.names()
    await s.put(s.raw, DOMAIN, host('late'))
    const answer = await s.store.readRecord(DOMAIN, keyOf('late'))
    expect(answer).toMatchObject({ kind: 'complete', record: host('late') })
  })

  it('for a domain without records is the answer of the store', async () => {
    const s = scene()
    expect(await s.names()).toEqual([])
    await s.put(s.raw, DOMAIN, host('late'))
    expect(await s.names()).toEqual([keyOf('late')])
  })

  it('confirms the snapshot when the store has the same revision: later reads make no round trip', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    await s.names()
    expect(await s.store.readRecord(DOMAIN, keyOf('none'))).toMatchObject({ record: null })
    const before = { ...s.trips }
    expect(await s.names()).toEqual([keyOf('a')])
    expect(s.trips).toEqual(before)
  })
})

describe('a commit that did not go through the keeper', () => {
  it('is seen after the age of the snapshot: one read of the revision, then the whole domain', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    await s.names()
    await s.put(s.raw, DOMAIN, host('b'))
    expect(await s.names()).toEqual([keyOf('a')])
    s.pass(SNAPSHOT_MAX_AGE_MS + 1)
    expect(await s.names()).toEqual([keyOf('a'), keyOf('b')])
  })

  it('costs one read of the revision per age when nothing moved', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    await s.names()
    const before = { ...s.trips }
    s.pass(SNAPSHOT_MAX_AGE_MS + 1)
    await s.names()
    await s.names()
    expect(s.trips).toEqual({ ...before, readRecord: before.readRecord + 1 })
  })

  it('refuses the next write on the snapshot once; the snapshot goes and the next read is whole', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    const stale = await s.store.read(DOMAIN)
    if (stale.kind !== 'complete') throw new Error('fixture read failed')
    await s.put(s.raw, DOMAIN, host('b'))
    const refused = await s.store.commit({
      domain: DOMAIN,
      expected: stale.revision,
      revision: revision('900'),
      writes: [{ kind: 'put', record: host('c') }],
    })
    expect(refused.kind).toBe('conflict')
    expect(await s.names()).toEqual([keyOf('a'), keyOf('b')])
  })

  it('on an asserted domain refutes the snapshot of that domain', async () => {
    const s = scene()
    await s.put(s.store, OTHER, host('guard'))
    const guard = await s.store.read(OTHER)
    if (guard.kind !== 'complete') throw new Error('fixture read failed')
    await s.put(s.raw, OTHER, host('moved'))
    const refused = await s.store.commit({
      domain: DOMAIN,
      expected: revision('0'),
      revision: revision('1'),
      writes: [{ kind: 'put', record: host('a') }],
      asserts: [{ domain: OTHER, revision: guard.revision }],
    })
    expect(refused.kind).toBe('conflict')
    expect(await s.names(OTHER)).toEqual([keyOf('guard'), keyOf('moved')])
  })
})

describe('a commit answer that tells nothing', () => {
  it.each(['unknown-applied', 'unknown-dropped'] as const)(
    '%s: the snapshot goes and the next read is the store',
    async fault => {
      const s = scene()
      await s.put(s.store, DOMAIN, host('a'))
      await s.names()
      s.memory.injectCommit(fault)
      expect((await s.put(s.store, DOMAIN, host('b'))).kind).toBe('unknown')
      expect(await s.store.read(DOMAIN)).toEqual(await s.memory.read(DOMAIN))
    },
  )

  it('unavailable wrote nothing: the snapshot stays', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    await s.names()
    s.memory.injectCommit('unavailable')
    expect((await s.put(s.store, DOMAIN, host('b'))).kind).toBe('unavailable')
    const before = { ...s.trips }
    expect(await s.names()).toEqual([keyOf('a')])
    expect(s.trips).toEqual(before)
  })
})

describe('a dropped domain', () => {
  it('reads as never committed', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    const kept = await s.store.read(DOMAIN)
    if (kept.kind !== 'complete') throw new Error('fixture read failed')
    const dropped = await s.store.commit({
      domain: DOMAIN,
      expected: kept.revision,
      revision: revision('0'),
      writes: [{ kind: 'drop' }],
    })
    expect(dropped.kind).toBe('committed')
    expect(await s.store.read(DOMAIN)).toEqual({ kind: 'complete', revision: '0', records: [] })
  })
})

describe('a whole read that a commit of the same domain crossed', () => {
  it('does not become the snapshot', async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a'))
    // The store answers the read with the content before the commit; the answer arrives after it.
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const slow: typeof s.raw = {
      ...s.raw,
      read: async domain => {
        const answer = await s.raw.read(domain)
        await gate
        return answer
      },
    }
    const cold = new LedgerKeeper()
    const reader = keeping(cold, slow, () => 0)
    const writer = keeping(cold, s.raw, () => 0)
    const early = reader.read(DOMAIN)
    await s.put(writer, DOMAIN, host('b'))
    release?.()
    expect(await early).toMatchObject({ kind: 'complete' })
    const after = await writer.read(DOMAIN)
    expect(after).toEqual(await s.memory.read(DOMAIN))
  })
})

describe('what a read hands out', () => {
  it("is the reader's own copy: a change to it does not reach the next read", async () => {
    const s = scene()
    await s.put(s.store, DOMAIN, host('a', { n: [1] }))
    for (const read of [() => s.store.read(DOMAIN), () => s.store.read(DOMAIN)]) {
      const answer = await read()
      if (answer.kind !== 'complete') throw new Error('fixture read failed')
      ;(answer.records[0] as { host: { value: { n: number[] } } }).host.value.n.push(2)
    }
    const one = await s.store.readRecord(DOMAIN, keyOf('a'))
    if (one.kind !== 'complete' || one.record?.kind !== 'host') throw new Error('read failed')
    ;(one.record.host.value as { n: number[] }).n.push(3)
    expect(await s.store.readRecord(DOMAIN, keyOf('a'))).toMatchObject({
      record: host('a', { n: [1] }),
    })
  })
})
