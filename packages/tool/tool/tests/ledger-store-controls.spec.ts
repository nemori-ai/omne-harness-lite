import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { runConformanceCase } from '@omne-harness/tool-contract/testing'
import {
  createMemoryToolLedgerStoreFixture,
  toolLedgerStoreConformance,
  toolLedgerStoreCompositionConformance,
  type ToolLedgerStoreControls,
  type ToolLedgerStoreFixture,
} from '@omne-harness/tool/testing'

const cases = [...toolLedgerStoreConformance(), ...toolLedgerStoreCompositionConformance()]
const optional = [
  ['store.read-unavailable', 'readUnavailable'],
  ['store.commit-unavailable', 'commitUnavailable'],
  ['store.unknownApplied', 'unknownApplied'],
  ['store.unknownDropped', 'unknownDropped'],
  ['store.throwApplied', 'throwApplied'],
  ['store.delayed-land', 'delayed'],
  ['store.delayed-fence', 'delayed'],
  ['store.rejected-copy', 'rejectedHostValue'],
  ['ledger.unknownApplied', 'unknownApplied'],
  ['ledger.throwApplied', 'throwApplied'],
  ['ledger.unknownDropped', 'unknownDropped'],
  ['ledger.delayed-fresh-retry', 'delayed'],
  ['ledger.fence-unknownDropped', 'unknownDropped'],
  ['ledger.fence-commitUnavailable', 'commitUnavailable'],
] satisfies readonly (readonly [string, keyof ToolLedgerStoreControls])[]

describe('missing controls are independent and checked before any IO', () => {
  for (const [name, handle] of optional)
    it(`${name} needs ${handle}`, async () => {
      const original = createMemoryToolLedgerStoreFixture()
      const controls = { ...original.controls }
      delete controls[handle]
      let io = 0
      const fixture: ToolLedgerStoreFixture = {
        ...original,
        controls,
        store: {
          durability: 'none',
          read: domain => {
            io += 1
            return original.store.read(domain)
          },
          commit: input => {
            io += 1
            return original.store.commit(input)
          },
        },
      }
      const check = cases.find(item => item.name === name)
      assert.ok(check)
      try {
        assert.deepEqual(await runConformanceCase(check, fixture), {
          kind: 'not-applicable',
          handle,
        })
        assert.equal(io, 0, 'missing handle must be detected before IO or seeding')
      } finally {
        await fixture.close()
      }
    })
  it('does not turn an offered throwing control into not-applicable', async () => {
    const fixture = createMemoryToolLedgerStoreFixture()
    const error = new Error('control failed')
    const check = cases.find(item => item.name === 'store.read-unavailable')
    assert.ok(check)
    try {
      await assert.rejects(
        () =>
          runConformanceCase(check, {
            ...fixture,
            controls: {
              readUnavailable: () => {
                throw error
              },
            },
          }),
        caught => caught === error,
      )
    } finally {
      await fixture.close()
    }
  })
  it('does not turn store setup errors into not-applicable', async () => {
    const fixture = createMemoryToolLedgerStoreFixture()
    const error = new Error('provider read failed')
    const check = cases.find(item => item.name === 'store.snapshot')
    assert.ok(check)
    try {
      await assert.rejects(
        () =>
          runConformanceCase(check, {
            ...fixture,
            store: {
              ...fixture.store,
              read: async () => {
                throw error
              },
            },
          }),
        caught => caught === error,
      )
    } finally {
      await fixture.close()
    }
  })
})

for (const kind of ['unknown', 'unavailable', 'committed', 'conflict'] as const) {
  it(`encoding rejection probe distinguishes ${kind} without defining a rejection protocol`, async () => {
    const fixture = createMemoryToolLedgerStoreFixture()
    const check = cases.find(item => item.name === 'store.rejected-copy')
    assert.ok(check)
    const store: ToolLedgerStoreFixture['store'] = {
      ...fixture.store,
      commit: input => {
        const rejected = input.writes.some(
          write =>
            write.kind === 'put' &&
            write.record.kind === 'host' &&
            typeof write.record.host.value === 'function',
        )
        if (!rejected) return fixture.store.commit(input)
        if (kind === 'committed') return Promise.resolve({ kind })
        if (kind === 'conflict') return Promise.resolve({ kind, current: input.expected })
        return Promise.resolve({ kind, diagnostic: 'encoding rejected' })
      },
    }
    try {
      if (kind === 'unknown' || kind === 'unavailable')
        assert.deepEqual(await runConformanceCase(check, { ...fixture, store }), { kind: 'passed' })
      else
        await assert.rejects(
          () => runConformanceCase(check, { ...fixture, store }),
          error =>
            error instanceof assert.AssertionError &&
            error.message.includes('provider must reject its declared unencodable host value'),
        )
    } finally {
      await fixture.close()
    }
  })
}
