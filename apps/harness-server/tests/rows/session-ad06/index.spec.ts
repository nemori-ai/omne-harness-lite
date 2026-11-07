// @module-tag slow
import { Service, type Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { succeed } from '@omne-harness/operation-result'
import type {
  SessionFaces,
  SessionWorkPrincipals,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import {
  SessionService,
  SessionWorkPrincipalsService,
  sessionKey,
  sessionTransactionsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { consumeSessionToolLog, sessionAd06Row } from '../../../src/rows/session-ad06/index.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  type LoadedTree,
} from '../session-fixtures/tree.ts'

const access = memoryAccess({ kind: 'test-principal' })

/** The `session` stand-in: it records the caller class of every face read. */
function sessionRow(callers: unknown[]) {
  class Session extends SessionService<unknown> {
    get work(): SessionFaces<unknown>['work'] {
      callers.push(this[Service.resolveConfig]())
      return {
        // A session that started no Run: the consumption finds no Run of the execution.
        readWork: async () =>
          succeed({ run: { kind: 'idle' }, executions: [] } as unknown as WorkSnapshot),
      } as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }
  return standIn('session-standin', sessionKey, Session)
}

function standIn(name: string, key: string, make: new (ctx: Context) => object) {
  return declared(
    defineRow({
      row: name,
      implementation: 'real',
      manifest: { provides: [key], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name,
        apply(ctx: Context) {
          new make(ctx)
        },
      },
    }),
  )
}

class Journal extends Service {
  constructor(ctx: Context) {
    super(ctx, agentJournalKey)
  }
  readonly load = () => Promise.reject(new Error('not read in this test'))
}
class Entries extends Service {
  constructor(ctx: Context) {
    super(ctx, agentJournalEntriesKey)
  }
  readonly read = () => Promise.reject(new Error('not read in this test'))
}
class Materials extends Service {
  constructor(ctx: Context) {
    super(ctx, agentMaterialsKey)
  }
  readonly read = () => Promise.reject(new Error('not read in this test'))
}
class Transactions extends Service {
  constructor(ctx: Context) {
    super(ctx, sessionTransactionsKey)
  }
  readonly commitEntries = () => Promise.reject(new Error('not committed in this test'))
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(options: {
  journalViews: boolean
  callers?: unknown[]
  coordinatorCalls?: unknown[]
}): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const tree = await loadTree({
    base,
    entryObjects: BASE_ENTRY_OBJECTS.map(entry =>
      entry.name !== sessionWorkPrincipalsKey || options.coordinatorCalls === undefined
        ? entry
        : {
            ...entry,
            install(ctx) {
              class Principals extends SessionWorkPrincipalsService {
                readonly forSession: SessionWorkPrincipals<unknown>['forSession'] = async input => {
                  options.coordinatorCalls?.push(input)
                  return succeed(access.principal)
                }
              }
              new Principals(ctx)
            },
          },
    ),
    rows: [
      sessionRow(options.callers ?? []),
      standIn('transactions-standin', sessionTransactionsKey, Transactions),
      ...(options.journalViews
        ? [
            standIn('journal-standin', agentJournalKey, Journal),
            standIn('entries-standin', agentJournalEntriesKey, Entries),
            standIn('materials-standin', agentMaterialsKey, Materials),
          ]
        : []),
      declared(sessionAd06Row),
    ],
    readinessTimeoutMs: options.journalViews ? 10_000 : 2000,
  })
  release.push(() => tree.dispose())
  return tree
}

describe('the session-ad06 row: declaration', () => {
  it('is the real row: provides nothing, injects `session` and the Journal views, no shutdown phase', () => {
    expect(rowDeclarationOf(sessionAd06Row)).toEqual({
      row: 'session-ad06',
      implementation: 'real',
      manifest: {
        provides: [],
        injects: [
          'sessionWorkPrincipals',
          'session',
          'agentJournal',
          'agentJournalEntries',
          'agentMaterials',
          'sessionTransactions',
        ],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })
})

describe('the session-ad06 row: on real Cordis 4.0.4', () => {
  it(
    'keeps explicit consumption in its own root and removes it on disposal',
    { timeout: 60_000 },
    async () => {
      const firstCalls: unknown[] = [],
        secondCalls: unknown[] = []
      const first = await start({ journalViews: true, callers: firstCalls })
      const second = await start({ journalViews: true, callers: secondCalls })
      const target = { ...access, execution: 'execution-1' as never }
      await consumeSessionToolLog(first.root, target)
      expect(firstCalls.length).toBeGreaterThan(0)
      expect(secondCalls).toHaveLength(0)
      await first.dispose()
      expect(await consumeSessionToolLog(first.root, target)).toMatchObject({
        failure: { kind: 'unavailable', owner: 'session-ad06' },
      })
      await consumeSessionToolLog(second.root, target)
      expect(secondCalls.length).toBeGreaterThan(0)
    },
  )
  it(
    'uses the injected coordinator to consume a published execution',
    { timeout: 60_000 },
    async () => {
      const callers: unknown[] = [],
        coordinatorCalls: unknown[] = []
      const tree = await start({ journalViews: true, callers, coordinatorCalls })
      tree.root.emit(
        'session-adapters/agent-published',
        access.tenant,
        access.session,
        'execution-1' as never,
      )
      await expect
        .poll(() => coordinatorCalls)
        .toEqual([{ actor: 'coordinator', tenant: access.tenant, session: access.session }])
      await expect.poll(() => callers.length).toBeGreaterThan(0)
    },
  )
  it(
    'is ACTIVE with its six dependencies, and reads `session` as the coordinator',
    { timeout: 60_000 },
    async () => {
      const callers: unknown[] = []
      const tree = await start({ journalViews: true, callers })
      expect(tree.state('session-ad06')).toMatchObject({ state: 'ACTIVE', missing: [] })

      const answer = await consumeSessionToolLog(tree.root, {
        principal: access.principal,
        tenant: access.tenant,
        session: access.session,
        execution: 'execution-1' as never,
      })

      // The stand-in session started no Run: the real plugin answered from it, as coordinator.
      expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'session-history' } })
      expect(callers).not.toHaveLength(0)
      expect(
        callers.every(caller => (caller as { caller?: unknown }).caller === 'coordinator'),
      ).toBe(true)
    },
  )

  it(
    'without the Journal views stays PENDING and names the three keys',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ journalViews: false })
      expect(tree.state('session-ad06')).toMatchObject({
        state: 'PENDING',
        missing: ['agentJournal', 'agentJournalEntries', 'agentMaterials'],
      })
      expect(
        await consumeSessionToolLog(tree.root, {
          principal: access.principal,
          tenant: access.tenant,
          session: access.session,
          execution: 'execution-1' as never,
        }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
    },
  )
})
