// @module-tag slow
// The `agent-journal` row: the real Session-log Journal provider over the real storage rows. The row
// is ACTIVE and provides `agentJournal`, `agentJournalEntries` and `agentMaterials` from the one
// provider, as the assembly page asks; the provider serves the coordination its SPEC declares.
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentJournal } from '@omne-harness/agent-contract'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { agentJournalRow, agentJournalCombination } from '../../../src/rows/agent-journal/index.ts'
import { compositeManifestDigest } from '../../../src/rows/session-storage/composite.ts'
import { storageCatalog } from '../../../src/rows/storage/catalog.ts'
import {
  declared,
  loadTree,
  makeBase,
  storageRows,
  type LoadedTree,
} from '../session-fixtures/tree.ts'

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const storage = storageRows(base)
  const tree = await loadTree({
    base,
    rows: [...storage.specs, declared(agentJournalRow, agentJournalCombination())],
  })
  release.push(() => tree.dispose())
  return tree
}

describe('the agent-journal row: declaration', () => {
  it('is the real row: provides the three Journal keys, injects the three keys, no shutdown phase, group `agent-journal`', () => {
    expect(rowDeclarationOf(agentJournalRow)).toEqual({
      row: 'agent-journal',
      implementation: 'real',
      manifest: {
        provides: ['agentJournal', 'agentJournalEntries', 'agentMaterials'],
        injects: ['sessionAccessCheck', 'storage', 'tenantDomainLookup'],
        phase: null,
        sameProviderGroup: 'agent-journal',
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('names the combination of the session storage row: the version and the digest of the same catalog', () => {
    const manifest = compositeManifestDigest(storageCatalog())
    if (manifest.kind !== 'manifest') throw new Error(manifest.diagnostic)
    expect(agentJournalCombination()).toEqual({
      combinationVersion: 'session-composite/3',
      manifestDigest: manifest.digest,
    })
  })
})

describe('the agent-journal row: on the real storage rows', () => {
  it('is ACTIVE and provides the three Journal keys', { timeout: 60_000 }, async () => {
    const tree = await start()
    expect(tree.allActive).toBe(true)
    expect(tree.state('agent-journal')).toMatchObject({ state: 'ACTIVE', missing: [] })
    for (const key of [agentJournalKey, agentJournalEntriesKey, agentMaterialsKey])
      expect(tree.service(key), key).toBeDefined()
  })

  it(
    'serves the coordination and the participant set its SPEC declares',
    { timeout: 60_000 },
    async () => {
      const tree = await start()
      const journal = tree.service<AgentJournal<unknown>>(agentJournalKey)!
      expect(journal.capabilities.coordination).toBe('coordinated')
      expect([...journal.capabilities.participants].sort()).toEqual([
        'context-transition',
        'custody',
        'message',
        'processed',
      ])
    },
  )
})
