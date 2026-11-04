// @module-tag slow
// Reads and controls in a tenant that the session-storage directory does not hold, through the real
// Session faces (caller classes as `server-entry` takes them) over the real storage rows. Such a
// tenant never created a session, so the session does not exist: the answer is `denied`, the one
// answer of an absent session (public-contract「会话判断次序」第 6 步), and equal to the answer of a
// registered tenant that lacks the session. It must not be `unavailable`, which the public contract
// maps to `basis-unavailable` ("现在不能得出允许", retry later). Slow: a real SQLite tree per case.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import type {
  GuardCommand,
  SessionEvidenceBridge,
  SessionIdentityBridge,
} from '@omne-harness/session-contract'
import {
  createScriptedSessionIdentityBridge,
  creation,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import {
  SessionEvidenceBridgeService,
  SessionIdentityBridgeService,
  sessionEvidenceKey,
  sessionIdentityKey,
  sessionKey,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import { sessionClock } from '../../../src/entry/session-clock.ts'
import type { RowSpec } from '../../../src/loader.ts'
import { defineRow } from '../../../src/row.ts'
import { sessionAd12Row } from '../../../src/rows/session-ad12/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import { runtimeContextDoubleRow } from '../session-ad12/support.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  storageRows,
  type Base,
  type LoadedTree,
} from '../session-fixtures/tree.ts'
import { TENANT_A, TENANT_B, createGuards, textOf } from '../storage/fixtures/tree.ts'

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

function bridges(): readonly RowSpec[] {
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
      readonly prepare: SessionEvidenceBridge['prepare'] = command =>
        Promise.resolve(
          succeed<readonly GuardCommand[]>(command.kind === 'create' ? createGuards(command) : []),
        )
    }
    return new Evidence(ctx)
  })
  return [identityRow, evidenceRow]
}

const live: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const release of live.splice(0).reverse()) await release()
})

const heldTenants = (base: Base): string[] =>
  (JSON.parse(readFileSync(base.directoryFile, 'utf8')) as { tenants: string[] }).tenants

async function start(): Promise<{ tree: LoadedTree; base: Base }> {
  const base = makeBase()
  live.push(() => base.release())
  const tree = await loadTree({
    base,
    rows: [
      ...storageRows(base).specs,
      ...bridges(),
      runtimeContextDoubleRow(),
      declared(sessionAd12Row),
      declared(sessionProviderRealRow, { admission: 'none' }),
    ],
    entryObjects: [...BASE_ENTRY_OBJECTS, sessionClock],
  })
  live.push(() => tree.dispose())
  return { tree, base }
}

type Caller = 'intake' | 'reader'
function faces(tree: LoadedTree, caller: Caller): SessionService<unknown> {
  const session: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
    caller,
  }).session
  if (session === undefined) throw new Error('the tree provides no session')
  return session
}

const PRINCIPAL = 'tester'
const SESSION_OF_A = sessionId('sess-of-a')

function createIn(tree: LoadedTree, tenant: typeof TENANT_A, session: string) {
  return faces(tree, 'intake').management.create({
    principal: PRINCIPAL,
    tenant,
    session: sessionId(session),
    operation: operationId(`create-${session}`),
    creation: creation(),
  })
}

const asTenant = (tenant: typeof TENANT_A) => ({
  principal: PRINCIPAL,
  tenant,
  session: SESSION_OF_A,
})

/** The session-bound reads and controls that public operations reach, for the session of A named under `tenant`. */
const PROBES: Readonly<
  Record<string, (tree: LoadedTree, tenant: typeof TENANT_A) => Promise<unknown>>
> = {
  'history.begin': (tree, tenant) =>
    faces(tree, 'reader').history.begin({
      ...asTenant(tenant),
      kinds: ['message.user'],
      from: null,
      direction: 'forward',
      pageBytes: 4096,
    } as never),
  'history.next': (tree, tenant) =>
    faces(tree, 'reader').history.next({ ...asTenant(tenant), cursor: 'any-cursor' } as never),
  queryOperation: (tree, tenant) =>
    faces(tree, 'intake').work.queryOperation({
      ...asTenant(tenant),
      operation: operationId('create-sess-of-a'),
    } as never),
  cancelRun: (tree, tenant) =>
    faces(tree, 'intake').work.cancelRun({
      ...asTenant(tenant),
      operation: operationId('cancel-x'),
      run: 'run-1',
      urgency: 'graceful',
    } as never),
}

describe('a tenant that the directory does not hold', () => {
  for (const [name, probe] of Object.entries(PROBES))
    it(
      `${name} answers denied, the answer of a registered tenant without the session, and registers nothing`,
      { timeout: 60_000 },
      async () => {
        const { tree, base } = await start()
        const created = await createIn(tree, TENANT_A, 'sess-of-a')
        expect('ok' in created, JSON.stringify(created)).toBe(true)

        // Tenant B never created a session: the directory does not hold it.
        expect(heldTenants(base)).not.toContain(textOf(TENANT_B))
        const unregistered = await probe(tree, TENANT_B)
        expect(unregistered).toMatchObject({ failure: { kind: 'denied' } })
        expect(heldTenants(base)).not.toContain(textOf(TENANT_B))

        // Once B has a session of its own, the same probe in B's tenant answers the same.
        const own = await createIn(tree, TENANT_B, 'sess-of-b')
        expect('ok' in own, JSON.stringify(own)).toBe(true)
        // A malformed cursor is judged before the tenant is looked at, so `history.next` with the made-up
        // cursor of this probe answers `invalid` in a registered tenant; it has no session-absent answer to compare.
        if (name !== 'history.next') expect(await probe(tree, TENANT_B)).toEqual(unregistered)
      },
    )

  it(
    'leaves the owner of the session untouched: the same history read in tenant A succeeds',
    { timeout: 60_000 },
    async () => {
      const { tree } = await start()
      const created = await createIn(tree, TENANT_A, 'sess-of-a')
      expect('ok' in created, JSON.stringify(created)).toBe(true)
      const read = await PROBES['history.begin']!(tree, TENANT_A)
      expect('ok' in (read as object), JSON.stringify(read)).toBe(true)
    },
  )
})
