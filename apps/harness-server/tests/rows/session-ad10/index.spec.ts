// @module-tag slow
// The `session-ad10` row: the real evidence bridge of Session. The row is ACTIVE and provides
// `sessionEvidence` when all three narrow sources are present; a `create` is answered by the real
// `adoption-sources` row over the real `agent-adoptions` table; `preserveResult` additionally asks
// the production and custody sources. Those two have no provider row yet (the assembly page's gap
// table names the original fact owners), so in this tree they are test stand-ins, and without them
// the row stays PENDING and names both keys.
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type {
  GuardCommand,
  SessionCommand,
  SessionEvidenceBridge,
} from '@omne-harness/session-contract'
import { guard } from '@omne-harness/session-contract/testing'
import {
  SessionCustodySourceService,
  SessionProductionSourceService,
  sessionCustodySourceKey,
  sessionEvidenceKey,
  sessionProductionSourceKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { rowDeclarationOf, defineRow } from '../../../src/row.ts'
import { agentAdoptionsRow } from '../../../src/rows/agent-adoptions/index.ts'
import { adoptionSourcesRow } from '../../../src/rows/adoption-sources/index.ts'
import { sessionAd10Row } from '../../../src/rows/session-ad10/index.ts'
import { createCommand, factsOf, mappingConfig } from '../adoptions/support.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

/** A source stand-in of one missing original owner. `real` only so that a real row may inject it. */
function productionSource(participant: string): unknown {
  return class Production extends SessionProductionSourceService {
    readonly prepare = (command: SessionCommand) =>
      Promise.resolve(
        succeed<GuardCommand[]>([guard(`${participant}-owner`, participant, command.kind)]),
      )
  }
}

function custodySource(participant: string): unknown {
  return class Custody extends SessionCustodySourceService {
    readonly prepare = (command: SessionCommand) =>
      Promise.resolve(
        succeed<GuardCommand[]>([guard(`${participant}-owner`, participant, command.kind)]),
      )
  }
}

function sourceRow(
  name: string,
  key: string,
  make: (participant: string) => unknown,
  participant: string,
) {
  return declared(
    defineRow({
      row: name,
      implementation: 'real',
      manifest: { provides: [key], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name,
        apply(ctx: Context) {
          new (make(participant) as new (ctx: Context) => object)(ctx)
        },
      },
    }),
  )
}

const PROBE = 'ad10-probe'

function probeRow(capture: (bridge: SessionEvidenceBridge) => void) {
  return declared(
    defineRow({
      row: PROBE,
      implementation: 'real',
      manifest: { provides: [], injects: [sessionEvidenceKey], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: PROBE,
        inject: [sessionEvidenceKey],
        apply(ctx: Context) {
          capture(ctx[sessionEvidenceKey] as SessionEvidenceBridge)
        },
      },
    }),
  )
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(options: { sources: boolean }): Promise<{
  tree: LoadedTree
  bridge: SessionEvidenceBridge
}> {
  const base = makeBase()
  release.push(() => base.release())
  let bridge: SessionEvidenceBridge | undefined
  const tree = await loadTree({
    base,
    rows: [
      declared(agentAdoptionsRow, mappingConfig()),
      declared(adoptionSourcesRow),
      declared(sessionAd10Row),
      ...(options.sources
        ? [
            sourceRow('session-production', sessionProductionSourceKey, productionSource, 'production'),
            sourceRow('session-custody', sessionCustodySourceKey, custodySource, 'custody'),
          ]
        : []),
      probeRow(captured => (bridge = captured)),
    ],
    readinessTimeoutMs: options.sources ? 10_000 : 2000,
  })
  release.push(() => tree.dispose())
  if (bridge === undefined) throw new Error('the probe row did not run')
  return { tree, bridge }
}

describe('the session-ad10 row: declaration', () => {
  it('is the real row: provides `sessionEvidence`, injects the three narrow sources, no shutdown phase', () => {
    expect(rowDeclarationOf(sessionAd10Row)).toEqual({
      row: 'session-ad10',
      implementation: 'real',
      manifest: {
        provides: ['sessionEvidence'],
        injects: ['sessionAdoptionSource', 'sessionProductionSource', 'sessionCustodySource'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })
})

describe('the session-ad10 row: on the source rows', () => {
  it('is ACTIVE and provides `sessionEvidence`', { timeout: 60_000 }, async () => {
    const { tree } = await start({ sources: true })
    expect(tree.allActive).toBe(true)
    expect(tree.state('session-ad10')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service<SessionEvidenceBridge>(sessionEvidenceKey)).toBeDefined()
  })

  it(
    'a `create` gets the material of the real adoption source over the deployment mapping',
    { timeout: 60_000 },
    async () => {
      const { bridge } = await start({ sources: true })
      const prepared = await bridge.prepare(createCommand('alpha'))
      if (!('ok' in prepared)) throw new Error('expected material')
      expect(prepared.ok).toHaveLength(1)
      expect(factsOf(prepared.ok[0]!)).toMatchObject({ version: 1 })
    },
  )

  it(
    '`preserveResult` also asks the production and the custody source',
    { timeout: 60_000 },
    async () => {
      const { bridge } = await start({ sources: true })
      const command = {
        kind: 'preserveResult',
        input: createCommand('alpha').input,
      } as unknown as SessionCommand
      const prepared = await bridge.prepare(command)
      if (!('ok' in prepared)) throw new Error('expected material')
      expect(prepared.ok.map(material => material.participant)).toEqual([
        'production-owner',
        'custody-owner',
      ])
    },
  )

  it(
    'without the production and custody sources stays PENDING and names both keys',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      release.push(() => base.release())
      const tree = await loadTree({
        base,
        rows: [
          declared(agentAdoptionsRow, mappingConfig()),
          declared(adoptionSourcesRow),
          declared(sessionAd10Row),
        ],
        readinessTimeoutMs: 2000,
      })
      release.push(() => tree.dispose())
      expect(tree.state('session-ad10')).toMatchObject({
        state: 'PENDING',
        missing: ['sessionProductionSource', 'sessionCustodySource'],
      })
    },
  )
})
