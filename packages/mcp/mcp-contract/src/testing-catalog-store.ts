// The conformance suite of `CatalogStore`, and an in-memory double that passes it.
import assert from 'node:assert/strict'
import { mergeListing, type ActionCatalogRecord, type CatalogState } from './catalog.ts'
import { completeListing } from './listing.ts'
import type { CatalogStore } from './ports.ts'
import { conformanceCase, handle, tenantText, type ConformanceCase } from './testing-case.ts'
import { generationOf, jsonOf, protocolVersionOf, revisionOf } from './testing-values.ts'
import type { CatalogKey, PeerAccount } from './values.ts'

export type CatalogStoreFixture = Readonly<{
  store: CatalogStore
  /** A key that was never written. */
  key: CatalogKey
  /** Keys that differ from `key` in the tenant, the account or the holding; never written. */
  otherKeys: readonly CatalogKey[]
  /** Makes the store unavailable. */
  unavailable?: () => Promise<void>
}>

/** A record of `revision` whose actions are the given names, built by the public functions. */
function sampleRecord(revision: number, names: readonly string[]): ActionCatalogRecord {
  let state: CatalogState = { kind: 'not-acquired' }
  for (let round = 1; round <= revision; round += 1) {
    const basedOn = state.kind === 'acquired' ? state.record.revision : 'absent'
    const listing = completeListing({
      basedOn,
      pages: [
        {
          ok: {
            tools: names.map(name =>
              jsonOf({ name, description: `round ${round}`, inputSchema: { type: 'object' } }),
            ),
          },
        },
      ],
      basis: {
        generation: generationOf(round),
        protocolVersion: protocolVersionOf('2026-07-28'),
        capabilities: jsonOf({ tools: {} }),
      },
      acquiredAt: '2026-11-03T00:00:00Z',
      limits: { maxPages: 1, maxActions: names.length },
    })
    if ('failure' in listing) throw new TypeError(listing.failure)
    const merged = mergeListing(state, listing.ok)
    if ('failure' in merged) throw new TypeError(merged.failure)
    state = { kind: 'acquired', record: merged.ok }
  }
  if (state.kind !== 'acquired') throw new TypeError('a sample record needs revision 1 or more')
  return state.record
}

async function written(
  fixture: CatalogStoreFixture,
  revision: number,
): Promise<ActionCatalogRecord> {
  const record = sampleRecord(revision, ['read', 'write'])
  const expected = revision === 1 ? 'absent' : revisionOf(revision - 1)
  if (revision > 1)
    assert.deepStrictEqual(
      await fixture.store.write(fixture.key, sampleRecord(revision - 1, ['read']), 'absent'),
      { ok: true },
    )
  assert.deepStrictEqual(await fixture.store.write(fixture.key, record, expected), { ok: true })
  return record
}

export function mcpCatalogStoreConformance(): readonly ConformanceCase<CatalogStoreFixture>[] {
  return [
    conformanceCase('CS1', 'answers absent for a key never written', async fixture => {
      assert.deepStrictEqual(await fixture.store.read(fixture.key), { ok: 'absent' })
    }),
    conformanceCase(
      'CS2',
      'writes a first record against absent and reads it back whole',
      async fixture => {
        const record = await written(fixture, 1)
        assert.deepStrictEqual(await fixture.store.read(fixture.key), { ok: record })
      },
    ),
    conformanceCase(
      'CS3',
      'refuses a write that expects a revision for a key never written',
      async fixture => {
        const answer = await fixture.store.write(fixture.key, sampleRecord(2, ['a']), revisionOf(1))
        assert.deepStrictEqual(answer, { failure: 'revision-conflict' })
        assert.deepStrictEqual(await fixture.store.read(fixture.key), { ok: 'absent' })
      },
    ),
    conformanceCase(
      'CS4',
      'refuses a write that expects absent when a record exists, and keeps the record',
      async fixture => {
        const record = await written(fixture, 1)
        const answer = await fixture.store.write(fixture.key, sampleRecord(1, ['other']), 'absent')
        assert.deepStrictEqual(answer, { failure: 'revision-conflict' })
        assert.deepStrictEqual(await fixture.store.read(fixture.key), { ok: record })
      },
    ),
    conformanceCase(
      'CS5',
      'refuses a write based on an older revision, and keeps the newer record',
      async fixture => {
        const record = await written(fixture, 2)
        const late = sampleRecord(2, ['late'])
        assert.deepStrictEqual(await fixture.store.write(fixture.key, late, revisionOf(1)), {
          failure: 'revision-conflict',
        })
        assert.deepStrictEqual(await fixture.store.read(fixture.key), { ok: record })
      },
    ),
    conformanceCase('CS6', 'writes against the current revision', async fixture => {
      await written(fixture, 1)
      const next = sampleRecord(2, ['read', 'write', 'list'])
      assert.deepStrictEqual(await fixture.store.write(fixture.key, next, revisionOf(1)), {
        ok: true,
      })
      assert.deepStrictEqual(await fixture.store.read(fixture.key), { ok: next })
    }),
    conformanceCase('CS7', 'keeps tenants, accounts and holdings apart', async fixture => {
      await written(fixture, 1)
      for (const other of fixture.otherKeys)
        assert.deepStrictEqual(await fixture.store.read(other), { ok: 'absent' })
    }),
    conformanceCase(
      'CS8',
      'answers unavailable, not absent, when it cannot read',
      async fixture => {
        const unavailable = handle(fixture.unavailable, 'unavailable')
        await unavailable()
        assert.deepStrictEqual(await fixture.store.read(fixture.key), { failure: 'unavailable' })
        assert.deepStrictEqual(
          await fixture.store.write(fixture.key, sampleRecord(1, ['a']), 'absent'),
          { failure: 'unavailable' },
        )
      },
    ),
  ]
}

export type MemoryCatalogStore = CatalogStore &
  Readonly<{ setUnavailable(unavailable: boolean): void }>

function accountText(account: PeerAccount): string {
  return account.kind === 'anonymous' ? 'anonymous' : `credential:${account.binding}`
}

/**
 * Records by tenant, account and holding, for the suite and for tests. It is not the
 * production store, and it keeps nothing durable.
 */
export function createMemoryCatalogStore(): MemoryCatalogStore {
  const records = new Map<string, ActionCatalogRecord>()
  let unavailable = false
  const keyOf = (key: CatalogKey) =>
    JSON.stringify([tenantText(key.tenant), accountText(key.account), key.holding])
  return {
    async read(key) {
      if (unavailable) return { failure: 'unavailable' }
      return { ok: records.get(keyOf(key)) ?? 'absent' }
    },
    async write(key, record, expected) {
      if (unavailable) return { failure: 'unavailable' }
      const current = records.get(keyOf(key))?.revision ?? 'absent'
      if (current !== expected) return { failure: 'revision-conflict' }
      records.set(keyOf(key), record)
      return { ok: true }
    },
    setUnavailable: value => {
      unavailable = value
    },
  }
}
