// @module-tag slow
// The session read of the release Tool request source (`sessionWorkReaderOf`) against the real
// Session provider: the real `session-provider` row over the real storage rows, so the caller class
// check is Session's own table (`readWork` admits `coordinator` and `maintainer` only). A session is
// created through the `intake` caller class, as `server-entry` does, and the source's read must get
// its snapshot. Before R2-D266 the source read as `reader` and Session refused it with
// `denied readWork`, so no Tool action could be prepared.
// Named doubles, as in `rows/session-provider/create-storage.spec.ts`: the authorization row allows
// every access, the identity bridge lets the command through, the evidence bridge gives `create` its
// initialization guard, and `runtimeContext` is the contract double under the real `session-ad12`.
// Slow: a real SQLite tree per case.
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
import { sessionClock } from '../../src/entry/session-clock.ts'
import { sessionWorkReaderOf } from '../../src/entry/tool-requests.ts'
import type { RowSpec } from '../../src/loader.ts'
import { defineRow } from '../../src/row.ts'
import { sessionAd12Row } from '../../src/rows/session-ad12/index.ts'
import { sessionProviderRealRow } from '../../src/rows/session-provider/real.ts'
import { runtimeContextDoubleRow } from '../rows/session-ad12/support.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  storageRows,
  type LoadedTree,
} from '../rows/session-fixtures/tree.ts'
import { TENANT_A, createGuards } from '../rows/storage/fixtures/tree.ts'

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

const SESSION = sessionId('tool-request-source')
const access = { principal: 'tester', tenant: TENANT_A, session: SESSION }

async function withSession(): Promise<LoadedTree> {
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
  const intake: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
    caller: 'intake',
  }).session
  if (intake === undefined) throw new Error('the tree provides no session')
  const created = await intake.management.create({
    principal: 'tester',
    tenant: TENANT_A,
    session: SESSION,
    operation: operationId('create-tool-request-source'),
    creation: creation(),
  })
  if (!('ok' in created)) throw new Error(`create failed: ${JSON.stringify(created)}`)
  return tree
}

describe('the session read of the release Tool request source, on the real Session provider', () => {
  it(
    'reads the session snapshot through a caller class Session admits for readWork',
    { timeout: 60_000 },
    async () => {
      const tree = await withSession()
      const read = await sessionWorkReaderOf(tree.root)(access)
      expect(read).toEqual({ ok: expect.anything() })
      if (read === undefined || !('ok' in read)) throw new Error('unreachable')
      expect(read.ok).toMatchObject({ session: SESSION, tenant: TENANT_A })
    },
  )

  it(
    'Session refuses readWork to the reader caller class: the read the source made before the fix',
    { timeout: 60_000 },
    async () => {
      const tree = await withSession()
      const reader: SessionService<unknown> | undefined = tree.root.intercept(sessionKey, {
        caller: 'reader',
      }).session
      expect(await reader?.work.readWork(access)).toEqual({
        failure: { kind: 'denied', action: 'readWork' },
      })
    },
  )
})
