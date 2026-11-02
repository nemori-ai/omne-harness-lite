// 会话工作主体（验收 3、AA 运行时对象表、ports.ts `SessionWorkPrincipals`）：每次 `forSession` 都现读受信的
// `sessionPrincipalBindings`，读口缺席、`not-bound`、绑定不符、读失败或签发失败都不签发。经服务键调用。
import { describe, expect, it } from 'vitest'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type {
  DurableEvidence,
  SessionId,
  SessionPrincipalBindingSource,
} from '@omne-harness/session-contract'
import {
  SessionPrincipalBindingsService,
  SessionWorkPrincipalsService,
  sessionPrincipalBindingsKey,
  sessionWorkPrincipalsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import { sessionWorkPrincipals } from '../../src/entry/session-work-principals.ts'
import { ENTRY_COMPONENTS, verifierOf } from '../../src/entry/principals.ts'
import { fixtureEnv, fixtureTenant, got, heldValues, type FixtureEnv } from './support.ts'

type Reading = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>
const SOURCE: DurableEvidence = {
  owner: 'session-storage',
  record: 'binding/1',
  revision: '1',
  digest: 'd',
}
const session = (text: string): SessionId => text as SessionId

const bound = (tenant: TenantId, id: SessionId): Reading => ({
  ok: { kind: 'bound', tenant, session: id, source: SOURCE },
})
const notBound: Reading = { ok: { kind: 'not-bound' } }

/** 脚本化的归属读口：每次 `read` 取当前的 `answer`，记下被问过的输入。`answer` 是函数时由它作答（可抛出）。 */
class ScriptedBindings extends SessionPrincipalBindingsService {
  readonly asked: Parameters<SessionPrincipalBindingSource['read']>[0][] = []
  answer: Reading | (() => Promise<Reading>) = notBound
  readonly read: SessionPrincipalBindingSource['read'] = input => {
    this.asked.push(input)
    return typeof this.answer === 'function' ? this.answer() : Promise.resolve(this.answer)
  }
}

const TRUSTED = [sessionWorkPrincipalsKey, sessionPrincipalBindingsKey, principalIssuerKey]

async function installed(trusted: readonly string[] = TRUSTED) {
  const fixture = fixtureEnv(trusted)
  await fixture.install(sessionWorkPrincipals)
  const work = got(
    fixture.scopeOf(sessionWorkPrincipalsKey).get(sessionWorkPrincipalsKey),
    'sessionWorkPrincipals',
  )
  return { fixture, work }
}

function provideBindings(fixture: FixtureEnv): ScriptedBindings {
  return new ScriptedBindings(fixture.scopeOf(sessionPrincipalBindingsKey))
}

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')

describe('sessionWorkPrincipals.forSession', () => {
  it('issues an acting principal for a bound session, and the authority of this run verifies it', async () => {
    const { fixture, work } = await installed()
    const bindings = provideBindings(fixture)
    bindings.answer = bound(tenantA, session('ses_1'))
    const result = await work.forSession({
      actor: 'coordinator',
      tenant: tenantA,
      session: session('ses_1'),
    })
    if ('failure' in result) throw new Error(`expected a principal, got ${result.failure.kind}`)
    expect(result.ok).toMatchObject({
      kind: 'acting-for-tenant',
      actor: { kind: 'system', component: ENTRY_COMPONENTS.sessionWork },
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_1' },
    })
    await expect(verifierOf(fixture.env).verify(result.ok)).resolves.toMatchObject({
      kind: 'verified',
    })
    expect(bindings.asked).toEqual([{ tenant: tenantA, session: 'ses_1' }])
  })

  it('reads the bindings on every call: a binding that goes away denies the next call (验收 3 变异)', async () => {
    const { fixture, work } = await installed()
    const bindings = provideBindings(fixture)
    bindings.answer = bound(tenantA, session('ses_1'))
    const input = { actor: 'maintainer', tenant: tenantA, session: session('ses_1') } as const
    expect('ok' in (await work.forSession(input))).toBe(true)
    bindings.answer = notBound
    await expect(work.forSession(input)).resolves.toEqual({
      failure: { kind: 'denied', action: 'sessionWorkPrincipals.forSession' },
    })
    bindings.answer = bound(tenantA, session('ses_1'))
    expect('ok' in (await work.forSession(input))).toBe(true)
    expect(bindings.asked).toHaveLength(3)
  })

  it('answers unavailable when no bindings read port is provided, and again once it is withdrawn', async () => {
    const { fixture, work } = await installed()
    const input = { actor: 'coordinator', tenant: tenantA, session: session('ses_1') } as const
    await expect(work.forSession(input)).resolves.toEqual({
      failure: {
        kind: 'unavailable',
        owner: 'sessionPrincipalBindings',
        diagnostic: expect.stringContaining('not provided'),
      },
    })
    const bindings = provideBindings(fixture)
    bindings.answer = bound(tenantA, session('ses_1'))
    expect('ok' in (await work.forSession(input))).toBe(true)
  })

  it('does not read a bindings provider that sits on the root label, only the trusted scope', async () => {
    const { fixture, work } = await installed()
    const onRoot = new ScriptedBindings(fixture.root)
    onRoot.answer = bound(tenantA, session('ses_1'))
    await expect(
      work.forSession({ actor: 'coordinator', tenant: tenantA, session: session('ses_1') }),
    ).resolves.toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(onRoot.asked).toEqual([])
  })

  it('answers unavailable when the bindings name is not a trusted name of this assembly', async () => {
    const { work } = await installed([sessionWorkPrincipalsKey, principalIssuerKey])
    await expect(
      work.forSession({ actor: 'coordinator', tenant: tenantA, session: session('ses_1') }),
    ).resolves.toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionPrincipalBindings' },
    })
  })

  it('quarantines a binding that names another tenant or another session, and never issues', async () => {
    const { fixture, work } = await installed()
    const bindings = provideBindings(fixture)
    bindings.answer = bound(tenantB, session('ses_1'))
    await expect(
      work.forSession({ actor: 'coordinator', tenant: tenantA, session: session('ses_1') }),
    ).resolves.toMatchObject({
      failure: { kind: 'quarantined' },
    })
    bindings.answer = bound(tenantA, session('ses_2'))
    await expect(
      work.forSession({ actor: 'coordinator', tenant: tenantA, session: session('ses_1') }),
    ).resolves.toMatchObject({
      failure: { kind: 'quarantined' },
    })
  })

  it('passes a failed read on and turns a throwing read into unavailable', async () => {
    const { fixture, work } = await installed()
    const bindings = provideBindings(fixture)
    const input = { actor: 'coordinator', tenant: tenantA, session: session('ses_1') } as const
    bindings.answer = {
      failure: { kind: 'unavailable', owner: 'session-storage', diagnostic: 'store down' },
    }
    await expect(work.forSession(input)).resolves.toEqual({
      failure: { kind: 'unavailable', owner: 'session-storage', diagnostic: 'store down' },
    })
    bindings.answer = { failure: { kind: 'quarantined', diagnostic: 'record disagrees' } }
    await expect(work.forSession(input)).resolves.toEqual({
      failure: { kind: 'quarantined', diagnostic: 'record disagrees' },
    })
    bindings.answer = () => Promise.reject(new Error('secret: do not echo'))
    const thrown = await work.forSession(input)
    expect(thrown).toMatchObject({
      failure: { kind: 'unavailable', owner: 'sessionPrincipalBindings' },
    })
    expect(JSON.stringify(thrown)).not.toContain('secret')
  })

  it('answers unavailable with owner identity when the issuer refuses, and issues nothing', async () => {
    const { fixture, work } = await installed()
    const bindings = provideBindings(fixture)
    bindings.answer = bound(tenantA, session(''))
    await expect(
      work.forSession({ actor: 'coordinator', tenant: tenantA, session: session('') }),
    ).resolves.toMatchObject({
      failure: { kind: 'unavailable', owner: 'identity' },
    })
  })

  it('is the session-contract service definition, exposes forSession only, and holds no issuer', async () => {
    const { fixture, work } = await installed()
    expect(work).toBeInstanceOf(SessionWorkPrincipalsService)
    expect(fixture.root.get(sessionWorkPrincipalsKey)).toBeUndefined()
    expect(sessionWorkPrincipals).toMatchObject({
      name: 'sessionWorkPrincipals',
      implementation: 'real',
    })
    const issuer = fixture.scopeOf(principalIssuerKey).get(principalIssuerKey)
    expect(issuer).toBeUndefined()
    expect(
      JSON.stringify([...heldValues(sessionWorkPrincipals)].filter(v => typeof v === 'string')),
    ).not.toMatch(/issueSystem|issueActingForTenant/u)
  })
})
