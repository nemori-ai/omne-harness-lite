import { describe, expect, it } from 'vitest'
import { inProcessPrincipalAuthority, type TenantStandingReading } from '@omne-harness/identity'
import {
  decodeModelCallId,
  decodeModelOperationId,
  type Lookup,
  type ModelDiagnosticsPage,
} from '@omne-harness/model-contract'
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { createSqlModelDiagnostics } from '@omne-harness/model-storage-sql'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { createModelQualification } from '../../src/model/qualification.ts'
import { qualifyingCommands } from '../../src/model/commands-qualifying.ts'
import { qualifyingDiagnostics } from '../../src/rows/model-records/diagnostics.ts'
import { fixtureTenant, okOf } from '../entry/support.ts'

const tenant = fixtureTenant('a')
const call = okOf(decodeModelCallId('mcall_read'), 'call')
const admission = okOf(decodeModelOperationId('mop_read'), 'admission')
const MEMBER: TenantStandingReading = {
  kind: 'member',
  role: { model: { model: 'default-team', revision: '1' }, role: 'member' },
  qualifications: [],
  evidence: { record: 'standing', revision: '1' },
}
function scene() {
  const authority = inProcessPrincipalAuthority()
  const actor = okOf(authority.issuer.issueSystem({ component: 'server-entry' }), 'actor')
  const principal = okOf(
    authority.issuer.issueActingForTenant({
      actor,
      tenant,
      work: { owner: 'identity-login', work: 'login-1' },
    }),
    'login',
  )
  let member = true
  let current = true
  const qualification = createModelQualification({
    verifier: authority.verifier,
    standing: {
      read: async () =>
        member ? MEMBER : { kind: 'not-member', evidence: { record: 'standing', revision: '2' } },
    },
  })
  return {
    access: { principal, tenant, call },
    qualification,
    qualify: () => qualification.qualify({ principal, tenant }, () => current),
    qualifyRead: () => qualification.qualifyRead({ principal, tenant }, () => current),
    revoke() {
      member = false
    },
    retire() {
      current = false
    },
  }
}

const page: ModelDiagnosticsPage = {
  entries: [],
  next: null,
  coverage: 'complete-through-snapshot',
  snapshot: { owner: 'model', record: 'call', revision: '1', digest: 'd' },
  retention: { owner: 'test', name: 'retained', revision: '1', digest: 'd' },
}

// The paused read supplies data; the real issuer, verifier and qualification govern its release.
describe('read completion checks', () => {
  it.each(['recall', 'dispatches'] as const)(
    '%s withholds a result when membership is revoked during the read',
    async method => {
      const s = scene()
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      const lookup: Lookup = { kind: 'not-accepted', operation: admission }
      const inner = {
        recall: async () => {
          entered.resolve()
          await resume.promise
          return { ok: lookup }
        },
        dispatches: async () => {
          entered.resolve()
          await resume.promise
          return { ok: [] }
        },
      } as unknown as ModelCommands<unknown>
      const commands = qualifyingCommands(inner, s.qualify, s.qualifyRead)
      const pending =
        method === 'recall'
          ? commands.recall({ ...s.access, admission })
          : commands.dispatches(s.access)
      await entered.promise
      s.revoke()
      resume.resolve()
      expect(await pending).toEqual({
        failure: { kind: 'denied', action: method === 'recall' ? 'inspect' : 'read-account' },
      })
      expect(
        s.qualification.authority.authorize({
          action: 'inspect',
          access: s.access,
          resource: { kind: 'tenant' },
        }),
      ).toMatchObject({ failure: { kind: 'unavailable' } })
    },
  )

  it.each(['revoke', 'retire'] as const)(
    'diagnostics %s during its SQL domain lookup cannot return a successful empty page',
    async change => {
      const s = scene()
      const entered = Promise.withResolvers<void>()
      const resume = Promise.withResolvers<void>()
      const domains: TenantDomainLookup = {
        lookup: async () => {
          entered.resolve()
          await resume.promise
          return { kind: 'unregistered' }
        },
      }
      // No domain means no SQL invocation; this exercises the SQL reader's real async lookup path.
      const reader = createSqlModelDiagnostics({
        storage: {} as SqlStorage,
        domains,
        authority: s.qualification.authority,
        diagnosticsRead: 'tenant-self',
        retention: { owner: 'test', name: 'retained', revision: '1', digest: 'd' },
      })
      const diagnostics = qualifyingDiagnostics(reader, s.qualifyRead)
      const pending = diagnostics.list({ ...s.access, after: null, limit: 1 })
      await entered.promise
      s[change]()
      resume.resolve()
      expect(await pending).toMatchObject({ failure: { kind: 'denied' } })
    },
  )

  it('each direct diagnostics page qualifies independently and releases on a thrown reader', async () => {
    const s = scene()
    let throws = false
    const diagnostics = qualifyingDiagnostics(
      {
        list: async () => {
          if (throws) throw new Error('SQL fault')
          return { ok: page }
        },
      },
      s.qualifyRead,
    )
    const input = { ...s.access, after: null, limit: 1 }
    expect(await diagnostics.list(input)).toEqual({ ok: page })
    expect(await diagnostics.list(input)).toEqual({ ok: page })
    throws = true
    await expect(diagnostics.list(input)).rejects.toThrow('SQL fault')
    expect(
      s.qualification.authority.authorize({
        action: 'inspect',
        access: s.access,
        resource: { kind: 'tenant' },
      }),
    ).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})
