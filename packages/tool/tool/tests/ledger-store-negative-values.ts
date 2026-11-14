import type {
  LedgerCommitInput,
  LedgerDomain,
  LedgerRead,
  PendingCall,
  ToolLedgerStore,
} from '@omne-harness/tool'
import {
  createMemoryToolLedgerStoreFixture,
  type ToolLedgerStoreFixture,
} from '@omne-harness/tool/testing'

type Store = ToolLedgerStore
export function wrappedFixture(wrap: (store: Store) => Store): ToolLedgerStoreFixture {
  const fixture = createMemoryToolLedgerStoreFixture()
  return { ...fixture, store: wrap(fixture.store) }
}
export function readMap(map: (read: LedgerRead) => LedgerRead): ToolLedgerStoreFixture {
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
      readRecord: (domain, key) => store.readRecord(collapse(domain), key),
      commit: input => store.commit({ ...input, domain: collapse(input.domain) }),
    }
  })
}
export function aliasInput(): ToolLedgerStoreFixture {
  return wrappedFixture(store => {
    let last: LedgerCommitInput | undefined
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
    let cached: LedgerRead | undefined
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
    let cached: LedgerRead | undefined
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
  let held: LedgerCommitInput | undefined
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

export function separateMarker(when: 'before' | 'answered'): ToolLedgerStoreFixture {
  return wrappedFixture(store => {
    const markers = new Map<string, PendingCall>()
    const mark = (input: LedgerCommitInput) => {
      const { domain, pending } = input
      if (domain.kind !== 'call' || pending === undefined) return
      const key = JSON.stringify([
        domain.tenant.organization.text,
        domain.tenant.account.text,
        domain.call,
      ])
      if (pending) markers.set(key, { tenant: domain.tenant, call: domain.call })
      else markers.delete(key)
    }
    return {
      ...store,
      commit: async input => {
        if (when === 'before') mark(input)
        const answer = await store.commit(input)
        if (when === 'answered' && answer.kind === 'committed') mark(input)
        return answer
      },
      scanPending: async input => {
        const listed = [...markers.values()].filter(
          entry =>
            input.tenant === null ||
            (entry.tenant.organization.text === input.tenant.organization.text &&
              entry.tenant.account.text === input.tenant.account.text),
        )
        return { kind: 'page', calls: listed, more: false }
      },
    }
  })
}

export function firstPageOnly(): ToolLedgerStoreFixture {
  return wrappedFixture(store => ({
    ...store,
    scanPending: async input => {
      const answer = await store.scanPending?.(input)
      return answer === undefined || answer.kind !== 'page' ? answer! : { ...answer, more: false }
    },
  }))
}

export function neverUnmark(): ToolLedgerStoreFixture {
  return wrappedFixture(store => ({
    ...store,
    commit: ({ pending, ...input }) =>
      store.commit(
        pending === false ? input : { ...input, ...(pending === undefined ? {} : { pending }) },
      ),
  }))
}
