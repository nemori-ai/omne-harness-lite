// @module-tag slow
// The real `session-provider` row creates a session: with the real `session-ad12` row over a
// `runtimeContext` contract double, the real principal entry objects and `sessionClock`, and the
// contract doubles of `session-contract/testing` for the access check, the delegated transactions,
// the identity bridge and the evidence bridge, `management.create` answers a receipt. With the S0
// stub in the place of `session-ad12`, the same `create` is `unavailable` naming
// `sessionContextInput`: the provider fills in no Context input, and the entry turns that into
// `basis-unavailable`. The composition over the real storage rows is the assembly's to prove.
// Slow: it loads a Cordis tree per case.
import { afterEach, describe, expect, it } from 'vitest'
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import type {
  GuardCommand,
  SessionCommand,
  SessionDelegatedTransactions,
  SessionEvidenceBridge,
  SessionIdentityBridge,
} from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  createMemoryInitializationSource,
  createMemorySessionTransactionPair,
  createScriptedSessionIdentityBridge,
  creation,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  SessionDelegatedTransactionsService,
  SessionEvidenceBridgeService,
  SessionIdentityBridgeService,
  sessionDelegatedTransactionsKey,
  sessionEvidenceKey,
  sessionIdentityKey,
  sessionKey,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import { stubPlugin } from '../../../src/cordis.ts'
import { sessionClock } from '../../../src/entry/session-clock.ts'
import type { RowSpec } from '../../../src/loader.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow } from '../../../src/row.ts'
import { sessionAd12Row } from '../../../src/rows/session-ad12/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import type { RowId, TreeRow } from '../../../src/types.ts'
import { runtimeContextDoubleRow } from '../session-ad12/support.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  type LoadedTree,
} from '../session-fixtures/tree.ts'
import { TENANT_A, accessPolicyRow, allowAll } from '../storage/fixtures/tree.ts'

type CreateCommand = Extract<SessionCommand, { kind: 'create' }>

/** A contract-double row that provides one key from a `session-contract/testing` double. */
function doubleRow(row: string, key: string, make: (ctx: Context) => object): RowSpec {
  return declared(
    defineRow({
      row,
      implementation: 'contract-double',
      manifest: { provides: [key], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: `${row}-double`,
        apply(ctx: Context) {
          make(ctx)
        },
      },
    }),
  )
}

/**
 * The doubles below the provider: one memory core gives the delegated transactions, and the
 * evidence bridge prepares the initialization guard of a `create` through the initialization
 * source of that same core, so the core recognises the guard it is handed back.
 */
function doubles(): readonly RowSpec[] {
  const access = accessPolicyRow(allowAll)
  const initialization = createMemoryInitializationSource()
  const pair = createMemorySessionTransactionPair<unknown>({
    initialization,
    accessCheck: access.check,
  })
  const delegatedRow = doubleRow('session-storage', sessionDelegatedTransactionsKey, ctx => {
    class Delegated extends SessionDelegatedTransactionsService<unknown> {
      readonly bind: SessionDelegatedTransactions<unknown>['bind'] = checked =>
        pair.delegated.bind(checked)
    }
    return new Delegated(ctx)
  })
  const identityRow = doubleRow('session-ad09', sessionIdentityKey, ctx => {
    const scripted = createScriptedSessionIdentityBridge<unknown>('allow')
    class Identity extends SessionIdentityBridgeService<unknown> {
      readonly prepare: SessionIdentityBridge<unknown>['prepare'] = (input, command) =>
        scripted.prepare(input, command)
    }
    return new Identity(ctx)
  })
  const evidenceRow = doubleRow('session-ad10', sessionEvidenceKey, ctx => {
    class Evidence extends SessionEvidenceBridgeService {
      readonly prepare: SessionEvidenceBridge['prepare'] = command => {
        if (command.kind !== 'create') return Promise.resolve(succeed<GuardCommand[]>([]))
        initialization.controls.register(
          command,
          initializationFixtureGuard(
            initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
          ),
        )
        return initialization.prepare(command)
      }
    }
    return new Evidence(ctx)
  })
  return [declared(access.plugin), delegatedRow, identityRow, evidenceRow]
}

/** The S0 stub of the table row `session-ad12`, as the release tree loads it today. */
function stubAd12Row(): RowSpec {
  const id = 'session-ad12' as RowId
  const manifest = serveProfile().stubManifests.get(id)
  if (manifest === undefined) throw new Error('session-ad12 is not in the table')
  const row: TreeRow = { id, plugin: 'stubPlugin', config: {}, source: 'distribution' }
  const plugin = stubPlugin({ id, manifest, hooks: { observe: () => {} } }) as Plugin
  return { row, manifest, plugin, implementation: 's0-double' }
}

const live: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const release of live.splice(0).reverse()) await release()
})

async function start(options: { contextInput: 'real' | 'stub' }): Promise<LoadedTree> {
  const base = makeBase()
  live.push(() => base.release())
  const tree = await loadTree({
    base,
    rows: [
      ...doubles(),
      runtimeContextDoubleRow(),
      options.contextInput === 'real' ? declared(sessionAd12Row) : stubAd12Row(),
      declared(sessionProviderRealRow, { admission: 'none' }),
    ],
    entryObjects: [...BASE_ENTRY_OBJECTS, sessionClock],
  })
  live.push(() => tree.dispose())
  return tree
}

/** The faces as `server-entry` takes them: through the `intake` caller class. */
function createOf(tree: LoadedTree, name: string) {
  const session: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
    caller: 'intake',
  }).session
  if (session === undefined) throw new Error('the tree provides no session')
  const command: CreateCommand['input'] = {
    tenant: TENANT_A,
    session: sessionId(name),
    operation: operationId(`create-${name}`),
    creation: creation(),
  }
  return session.management.create({ principal: 'tester', ...command })
}

describe('the real session-provider row: create over the real session-ad12 row', () => {
  it('every row is ACTIVE', { timeout: 60_000 }, async () => {
    const tree = await start({ contextInput: 'real' })
    expect(tree.allActive).toBe(true)
    expect(tree.state('session-ad12')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.state('session-provider')).toMatchObject({ state: 'ACTIVE', missing: [] })
  })

  it(
    '`management.create` answers a receipt and the new dormant session',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ contextInput: 'real' })
      const created = await createOf(tree, 'sess-real')
      expect(created).toEqual({ ok: expect.anything() })
      if (!('ok' in created)) throw new Error('unreachable')
      expect(created.ok.receipt.operation).toBe(operationId('create-sess-real'))
      expect(created.ok.state.session).toBe(sessionId('sess-real'))
      expect(created.ok.state.lifecycle).toBe('dormant')
    },
  )

  it(
    'with the S0 stub in the place of session-ad12 the same `create` is unavailable, naming `sessionContextInput`',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ contextInput: 'stub' })
      const created = await createOf(tree, 'sess-stub')
      expect(created).toMatchObject({
        failure: { kind: 'unavailable', owner: 'sessionContextInput' },
      })
    },
  )
})
