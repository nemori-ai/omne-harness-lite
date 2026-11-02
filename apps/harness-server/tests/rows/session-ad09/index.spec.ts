// @module-tag slow
// The `session-ad09` row: the real identity bridge over the entry object `principalVerifier` of the
// assembly. The row is ACTIVE and provides `sessionIdentity`; a principal the in-process authority
// issued for the tenant gets material bound to the command, and a value identity never issued is
// denied. A contract double answers nothing of this: the bridge is the real plugin of
// `@omne-harness/session-adapters`.
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { principalIssuerKey, type PrincipalIssuerService } from '@omne-harness/identity/cordis'
import type { SessionCommand, SessionIdentityBridge } from '@omne-harness/session-contract'
import { creation, memoryAccess, operationId } from '@omne-harness/session-contract/testing'
import { sessionIdentityKey } from '@omne-harness/session-cordis-contract/cordis'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { sessionAd09Row } from '../../../src/rows/session-ad09/index.ts'
import type { RowId, ServiceName } from '../../../src/types.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  type LoadedTree,
} from '../session-fixtures/tree.ts'

const access = memoryAccess({ kind: 'test-principal' })

const PROBE = 'ad09-probe' as RowId
const PROBE_NAMES: readonly ServiceName[] = [principalIssuerKey]

/** A row that can see the trusted issuer, which no release row of this tree can: it captures it. */
function probeRow(capture: (issuer: PrincipalIssuerService) => void) {
  return declared(
    defineRow({
      row: PROBE,
      implementation: 'real',
      manifest: { provides: [], injects: [...PROBE_NAMES], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'ad09-probe',
        inject: [...PROBE_NAMES],
        apply(ctx: Context) {
          capture(ctx[principalIssuerKey] as PrincipalIssuerService)
        },
      },
    }),
  )
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(): Promise<{ tree: LoadedTree; issuer: PrincipalIssuerService }> {
  const base = makeBase()
  release.push(() => base.release())
  let issuer: PrincipalIssuerService | undefined
  const tree = await loadTree({
    base,
    rows: [declared(sessionAd09Row), probeRow(captured => (issuer = captured))],
    entryObjects: BASE_ENTRY_OBJECTS,
    visibility: new Map([[PROBE, PROBE_NAMES]]),
  })
  release.push(() => tree.dispose())
  if (issuer === undefined) throw new Error('the probe row did not run')
  return { tree, issuer }
}

const command = (): Extract<SessionCommand, { kind: 'create' }> => ({
  kind: 'create',
  input: {
    tenant: access.tenant,
    session: access.session,
    operation: operationId('ad09-create'),
    creation: creation(),
  },
})

describe('the session-ad09 row: declaration', () => {
  it('is the real row, injects the verifier and provides `sessionIdentity`, with no shutdown phase', () => {
    expect(rowDeclarationOf(sessionAd09Row)).toEqual({
      row: 'session-ad09',
      implementation: 'real',
      manifest: {
        provides: ['sessionIdentity'],
        injects: ['principalVerifier'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })
})

describe('the session-ad09 row: on the assembly entry objects', () => {
  it('is ACTIVE and provides `sessionIdentity`', { timeout: 60_000 }, async () => {
    const { tree } = await start()
    expect(tree.allActive).toBe(true)
    expect(tree.state('session-ad09')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service<SessionIdentityBridge<unknown>>(sessionIdentityKey)).toBeDefined()
  })

  it(
    'gives a verified principal of the tenant material bound to the command; a principal it never issued is denied',
    { timeout: 60_000 },
    async () => {
      const { tree, issuer } = await start()
      const bridge = tree.service<SessionIdentityBridge<unknown>>(sessionIdentityKey)!
      const system = issuer.issueSystem({ component: 'ad09-test' })
      if ('failure' in system) throw new Error('the authority refused the test component')
      const acting = issuer.issueActingForTenant({
        actor: system.ok,
        tenant: access.tenant,
        work: { owner: 'test', work: 'session-ad09' },
      })
      if ('failure' in acting) throw new Error('the authority refused the test principal')
      const created = command()
      const prepared = await bridge.prepare({ ...access, principal: acting.ok } as never, created)
      if (!('ok' in prepared)) throw new Error('expected material')
      expect(prepared.ok).toMatchObject({ owner: 'identity', participant: 'identity-bridge' })

      const forged = await bridge.prepare(
        { ...access, principal: { kind: 'acting-for-tenant' } } as never,
        created,
      )
      expect(forged).toEqual({ failure: { kind: 'denied', action: 'create' } })
    },
  )
})
