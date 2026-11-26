// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentJournal } from '@omne-harness/agent-contract'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
  agentModelReceptionTargetsKey,
  agentToolReceptionTargetsKey,
  agentReceivedCommitsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { sessionModelHistoryReadinessKey } from '@omne-harness/session-adapters/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import {
  agentJournalRow,
  agentJournalCombination,
  createAgentJournalRow,
} from '../../../src/rows/agent-journal/index.ts'
import { releaseCancellation } from '../../../src/entry/cancellation-installation.ts'
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
    // No Runtime Context here: the row under test is the release row without telling the model.
    rows: [
      ...storage.specs,
      declared(createAgentJournalRow({ cancellation: releaseCancellation }), {
        combinationVersion: agentJournalCombination().combinationVersion,
      }),
    ],
  })
  release.push(() => tree.dispose())
  return tree
}

describe('the agent-journal row: declaration', () => {
  it('declares its Journal services, dependencies and provider group', () => {
    expect(rowDeclarationOf(agentJournalRow)).toEqual({
      row: 'agent-journal',
      implementation: 'real',
      manifest: {
        provides: [
          'agentCompactionInputs',
          'agentJournal',
          'agentJournalEntries',
          'agentMaterials',
          'agentReceivedCommits',
          'agentReceivedRecords',
          'agentModelReceptionTargets',
          'agentToolReceptionTargets',
          'sessionAdoptedRequests',
          'sessionExecutionLog',
          'sessionModelHistoryReadiness',
        ],
        injects: [
          'sessionAccessCheck',
          'storage',
          'tenantDomainLookup',
          'tenantDomains',
          'tenantDomainScannerPrincipal',
          'runtimeContext',
          'runtimeContextReaderEligibility',
        ],
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
      combinationVersion: 'session-composite/23',
      manifestDigest: manifest.digest,
    })
  })
})

describe('the agent-journal row: on the real storage rows', () => {
  it('serves the Journal and model history readiness', { timeout: 60_000 }, async () => {
    const tree = await start()
    expect(tree.allActive).toBe(true)
    expect(tree.state('agent-journal')).toMatchObject({ state: 'ACTIVE', missing: [] })
    for (const key of [
      agentJournalKey,
      agentJournalEntriesKey,
      agentMaterialsKey,
      agentReceivedCommitsKey,
      agentModelReceptionTargetsKey,
      agentToolReceptionTargetsKey,
    ])
      expect(tree.service(key), key).toBeDefined()
    expect(tree.service(sessionModelHistoryReadinessKey)).toMatchObject({
      ensure: expect.any(Function),
      qualify: expect.any(Function),
    })
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
