import type { ContentBlock } from '@omne-harness/content-block'
import type {
  LedgerCommitInput,
  LedgerDomain,
  LedgerRead,
  ToolLedgerStore,
} from '@omne-harness/tool'
import {
  createMemoryToolLedgerStoreFixture,
  type ToolLedgerStoreFixture,
} from '@omne-harness/tool/testing'

type Store = ToolLedgerStore<ContentBlock>
export function wrappedFixture(wrap: (store: Store) => Store): ToolLedgerStoreFixture {
  const fixture = createMemoryToolLedgerStoreFixture()
  return { ...fixture, store: wrap(fixture.store) }
}
export function readMap(
  map: (read: LedgerRead<ContentBlock>) => LedgerRead<ContentBlock>,
): ToolLedgerStoreFixture {
  return wrappedFixture(store => ({
    ...store,
    read: async domain => map(await store.read(domain)),
  }))
}
export function ignoreCas(): ToolLedgerStoreFixture {
  return wrappedFixture(store => ({
    ...store,
    commit: async input => {
      const result = await store.commit(input)
      return result.kind === 'conflict'
        ? store.commit({ ...input, expected: result.current })
        : result
    },
  }))
}
export function collapseDomains(): ToolLedgerStoreFixture {
  return wrappedFixture(store => {
    let first: LedgerDomain | undefined
    const collapse = (domain: LedgerDomain) => {
      first ??= domain
      return first
    }
    return {
      ...store,
      read: domain => store.read(collapse(domain)),
      commit: input => store.commit({ ...input, domain: collapse(input.domain) }),
    }
  })
}
export function aliasInput(): ToolLedgerStoreFixture {
  return wrappedFixture(store => {
    let last: LedgerCommitInput<ContentBlock> | undefined
    return {
      ...store,
      commit: async input => {
        last = input
        return store.commit(input)
      },
      read: async domain => {
        const read = await store.read(domain)
        return read.kind === 'complete' && last !== undefined
          ? {
              ...read,
              records: last.writes.flatMap(write => (write.kind === 'put' ? [write.record] : [])),
            }
          : read
      },
    }
  })
}
export function aliasOutput(): ToolLedgerStoreFixture {
  return wrappedFixture(store => {
    let cached: LedgerRead<ContentBlock> | undefined
    return {
      ...store,
      read: async domain => {
        cached ??= await store.read(domain)
        return cached
      },
    }
  })
}
export function shallowOutput(): ToolLedgerStoreFixture {
  return wrappedFixture(store => {
    let cached: LedgerRead<ContentBlock> | undefined
    return {
      ...store,
      read: async domain => {
        cached ??= await store.read(domain)
        if (cached.kind !== 'complete') return cached
        return {
          ...cached,
          records: cached.records.map(record => {
            if (record.kind !== 'host') return structuredClone(record)
            const value = record.host.value
            return {
              ...record,
              host: {
                ...record.host,
                value: typeof value === 'object' && value !== null ? { ...value } : value,
              },
            }
          }),
        }
      },
    }
  })
}
export function oldPartialApply(): ToolLedgerStoreFixture {
  return wrappedFixture(store => ({
    ...store,
    commit: async input => {
      const bad = input.writes.some(
        write =>
          write.kind === 'put' &&
          write.record.kind === 'host' &&
          typeof write.record.host.value === 'function',
      )
      if (!bad) return store.commit(input)
      for (const write of input.writes) {
        structuredClone(write)
        await store.commit({ ...input, revision: input.expected, writes: [write] })
      }
      throw new Error('expected a rejected clone')
    },
  }))
}
export function lateWithoutCas(): ToolLedgerStoreFixture {
  const fixture = createMemoryToolLedgerStoreFixture()
  let armed = false
  let held: LedgerCommitInput<ContentBlock> | undefined
  return {
    ...fixture,
    store: {
      ...fixture.store,
      commit: input => {
        if (!armed) return fixture.store.commit(input)
        armed = false
        held = structuredClone(input)
        return Promise.resolve({ kind: 'unknown', diagnostic: 'held' })
      },
    },
    controls: {
      ...fixture.controls,
      delayed: {
        arm: () => {
          armed = true
        },
        land: async () => {
          if (held === undefined) throw new Error('no held commit')
          const read = await fixture.store.read(held.domain)
          if (read.kind !== 'complete') throw new Error('no complete landing snapshot')
          await fixture.store.commit({ ...held, expected: read.revision })
        },
      },
    },
  }
}
export function withoutOperations(): ToolLedgerStoreFixture {
  return readMap(read =>
    read.kind === 'complete'
      ? { ...read, records: read.records.filter(record => record.kind !== 'operation') }
      : read,
  )
}
export function stateUsesDomainRevision(): ToolLedgerStoreFixture {
  return readMap(read =>
    read.kind === 'complete'
      ? {
          ...read,
          records: read.records.map(record =>
            record.kind === 'call'
              ? {
                  ...record,
                  call: {
                    ...record.call,
                    state: { ...record.call.state, revision: read.revision },
                  },
                }
              : record,
          ),
        }
      : read,
  )
}
