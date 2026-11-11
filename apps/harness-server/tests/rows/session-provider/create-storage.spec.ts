// @module-tag slow
// The real `session-provider` row over the real storage rows (`storage`, the authorization double,
// `session-storage`): a tenant that the tenant directory does not hold yet creates its first session.
// The Session core reads through the bound view (`queryOperation`) before it commits, and
// session-storage-sql resolves the tenant's domain on every read, so the `session-storage` row has
// to register the domain of a bound `create` before that first read, not at the commit. The session
// is in SQLite: a second tree over the same storage reads it back, and the directory file holds the
// tenant. Above the storage rows: the real `session-ad12` row over a `runtimeContext` contract
// double, and the `session-contract/testing` doubles for the identity bridge and the evidence
// bridge (the release's `session-ad09` is real; `session-ad10` has no production sources yet).
// Slow: a real SQLite tree per case.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { succeed } from '@omne-harness/operation-result'
import type {
  GuardCommand,
  SessionCommand,
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
import { disabledTelemetryRow } from '../telemetry/support.ts'
import { TENANT_A, createGuards, textOf } from '../storage/fixtures/tree.ts'

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

/** The identity bridge lets the command through; the evidence bridge gives a `create` its initialization guard. */
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

async function start(base: Base): Promise<LoadedTree> {
  const tree = await loadTree({
    base,
    rows: [
      disabledTelemetryRow(),
      ...storageRows(base).specs,
      ...bridges(),
      runtimeContextDoubleRow(),
      declared(sessionAd12Row),
      declared(sessionProviderRealRow, { admission: 'none' }),
    ],
    entryObjects: [...BASE_ENTRY_OBJECTS, sessionClock],
  })
  live.push(() => tree.dispose())
  return tree
}

function faces(tree: LoadedTree, caller: 'intake' | 'coordinator'): SessionService<unknown> {
  const session: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
    caller,
  }).session
  if (session === undefined) throw new Error('the tree provides no session')
  return session
}

const SESSION = sessionId('first-of-tenant')
const access = { principal: 'tester', tenant: TENANT_A, session: SESSION }

/** The faces as `server-entry` takes them: `create` through the `intake` caller class. */
function createFirst(tree: LoadedTree) {
  const command: CreateCommand['input'] = {
    tenant: TENANT_A,
    session: SESSION,
    operation: operationId('create-first-of-tenant'),
    creation: creation(),
  }
  return faces(tree, 'intake').management.create({ principal: 'tester', ...command })
}

const directoryTenants = (base: Base): string[] =>
  (JSON.parse(readFileSync(base.directoryFile, 'utf8')) as { tenants: string[] }).tenants

describe('the real session-provider row over the real storage rows: the first create of a tenant', () => {
  it(
    'a tenant the directory does not hold creates its first session: a receipt, and the directory then holds the tenant',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const tree = await start(base)
      expect(tree.allActive).toBe(true)
      const created = await createFirst(tree)
      expect(created).toEqual({ ok: expect.anything() })
      if (!('ok' in created)) throw new Error('unreachable')
      expect(created.ok.receipt.operation).toBe(operationId('create-first-of-tenant'))
      expect(created.ok.state).toMatchObject({ session: SESSION, lifecycle: 'dormant' })
      expect(directoryTenants(base)).toEqual([textOf(TENANT_A)])
    },
  )

  it(
    'the session is in SQLite: a tree started again over the same storage reads it back',
    { timeout: 60_000 },
    async () => {
      const base = makeBase()
      live.push(() => base.release())
      const first = await start(base)
      const created = await createFirst(first)
      expect(created).toEqual({ ok: expect.anything() })
      await first.shutdown()

      const second = await start(base)
      expect(second.allActive).toBe(true)
      const read = await faces(second, 'coordinator').work.readWork(access)
      expect(read).toEqual({ ok: expect.anything() })
      if (!('ok' in read)) throw new Error('unreachable')
      expect(read.ok).toMatchObject({ session: SESSION, tenant: TENANT_A, lifecycle: 'dormant' })
    },
  )
})
