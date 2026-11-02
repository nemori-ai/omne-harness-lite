// `runtimeContextTrust`（R2-D5、R2-D7、DP2-2 §5）：受信名，只有 `runtime-context` 行看得见。内容是
// `createSessionRuntimeContextTrust` 组合的四个端口。`authority` 照 `request-context-trust` 的次序：核验器先答，
// 只放行代租户行事主体，主体的租户必须等于动作里的租户，再按动作类别放行，其余一律拒绝。`bindings` 答
// `unavailable`：作用域文本是 Session 的单向摘要，入口不解码。`replayFacts` 答 `unavailable` 并点名 AD-03。
// `current` 是进程代次桥：读取方的 fiber 撤除后此前的答案都不当前。经服务键与导出的工厂调用，真实 Cordis。
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  type Principal,
  type PrincipalVerifier,
} from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  decodeScopeRef,
  type AuthorityDecision,
  type Eligibility,
  type HolderAction,
  type ProducerAction,
  type RegistrationChange,
  type RuntimeContextAuthority,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextTrustService,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import { principalIssuer } from '../../src/entry/principals.ts'
import {
  absentReplayFacts,
  createRuntimeContextAuthority,
  runtimeContextTrust,
  unavailableScopeBindings,
} from '../../src/entry/runtime-context-trust.ts'
import { fixtureEnv, fixtureTenant, got, okOf } from './support.ts'

const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')

function scopeOf(ref: string): ScopeRef {
  const decoded = decodeScopeRef({ ref })
  if ('failure' in decoded) throw new Error('fixture: scope')
  return decoded.ok
}
/** The shape Session mints (`decide-management.ts`): a one-way digest of tenant, session and generation. */
const scope = scopeOf(`session-scope:${'a'.repeat(64)}`)
const KEY = 'test.notes' as const
const PRODUCER = { producer: 'test-producer' }

function change(tenant: TenantId): RegistrationChange {
  return { kind: 'remove', scope, tenant, key: KEY, basedOn: 1, creating: false }
}

function eligibility(principal: unknown, tenant: TenantId): Eligibility<unknown> {
  return {
    id: { eligibility: 'e-1' },
    state: { kind: 'valid' },
    supersedes: null,
    scope,
    consumer: 'model',
    principal,
    tenant,
    keys: [KEY],
    bindings: [],
    registrationRevision: 1,
  }
}

/** Every holder action kind that names a tenant, for one tenant. */
function holderActions(principal: unknown, tenant: TenantId): readonly HolderAction<unknown>[] {
  const { id, state, ...material } = eligibility(principal, tenant)
  void id
  void state
  return [
    { kind: 'prepare', change: change(tenant) },
    {
      kind: 'commit',
      input: { kind: 'registration', commit: { commit: 'c-1' }, change: change(tenant) },
    },
    {
      kind: 'commit',
      input: {
        kind: 'step',
        commit: { commit: 'c-2' },
        tenant,
        stepCommit: { scope, step: { step: 's-1' }, committed: [], pending: [] },
        executionEnded: false,
      },
    },
    { kind: 'issue', material },
    {
      kind: 'begin-replay',
      scope,
      tenant,
      through: null,
      supersedes: null,
      previous: { checkpoint: null, registrationRevision: 0, end: null },
    },
    {
      kind: 'finish-replay',
      scope,
      tenant,
      replay: { replay: 'r-1' },
      through: null,
      material: { registrations: [], checkpoints: [], end: null },
      previous: { checkpoint: null, registrationRevision: 0, end: null },
      appliedCommits: [],
    },
  ]
}

function producerActions(tenant: TenantId): readonly ProducerAction[] {
  return [
    { kind: 'register', tenant, key: KEY, producer: PRODUCER },
    { kind: 'publish', scope, tenant, key: KEY, producer: PRODUCER },
    { kind: 'invalidate', scope, tenant, key: KEY, producer: PRODUCER },
    { kind: 'supply', scope, tenant, key: KEY, producer: PRODUCER },
    { kind: 'invalidate-tenant', tenant, key: KEY, producer: PRODUCER },
  ]
}

/** An authority with one verified acting principal of `component` for `tenant`. */
function authorityWithActing(component: string, tenant: TenantId) {
  const authority = inProcessPrincipalAuthority()
  const actor = okOf(authority.issuer.issueSystem({ component }), 'actor')
  const acting = okOf(
    authority.issuer.issueActingForTenant({
      actor,
      tenant,
      work: { owner: 'session', work: 'ses_1' },
    }),
    'acting principal',
  )
  return { authority, actor, acting }
}

/** The three faces, each asked once for the same tenant; every answer must have the same kind. */
async function kinds(
  authority: RuntimeContextAuthority<unknown>,
  principal: unknown,
  tenant: TenantId,
): Promise<Set<string>> {
  const seen = new Set<string>()
  for (const action of holderActions(principal, tenant))
    seen.add((await authority.holder(principal, action)).kind)
  for (const action of producerActions(tenant))
    seen.add((await authority.producer(principal, action)).kind)
  seen.add((await authority.reader(principal, eligibility(principal, tenant))).kind)
  return seen
}

describe('createRuntimeContextAuthority (the request-context-trust order)', () => {
  it('authorizes a verified acting principal for its own tenant on every face, and hands the same principal back', async () => {
    const { authority, acting } = authorityWithActing('session-ad03', tenantA)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    expect(await kinds(subject, acting, tenantA)).toEqual(new Set(['authorized']))
    const decision = await subject.producer(acting, producerActions(tenantA)[0]!)
    expect(decision.kind).toBe('authorized')
    if (decision.kind !== 'authorized') throw new Error('unreachable')
    expect(decision.principal).toBe(acting)
    expect(decision.current()).toBe(true)
  })

  it('refuses the principal of another tenant on every face: the tenant of the action is not its own', async () => {
    const { authority, acting } = authorityWithActing('session-ad03', tenantB)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    expect(await kinds(subject, acting, tenantA)).toEqual(new Set(['refused']))
  })

  it('refuses a hand-built copy of an acting principal and a system principal before the tenant is read', async () => {
    const { authority, actor } = authorityWithActing('session-ad03', tenantA)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    const forged: Principal = {
      kind: 'acting-for-tenant',
      actor,
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_1' },
    }
    expect(await kinds(subject, forged, tenantA)).toEqual(new Set(['refused']))
    expect(await kinds(subject, actor, tenantA)).toEqual(new Set(['refused']))
    expect(await kinds(subject, 'not a principal', tenantA)).toEqual(new Set(['refused']))
  })

  it('refuses an action kind outside the table, and `revoke`, which names no tenant', async () => {
    const { authority, acting } = authorityWithActing('session-ad03', tenantA)
    const subject = createRuntimeContextAuthority({ verifier: authority.verifier })
    const unknownHolder = { kind: 'erase', tenant: tenantA } as unknown as HolderAction<unknown>
    const unknownProducer = { kind: 'rename', tenant: tenantA } as unknown as ProducerAction
    await expect(subject.holder(acting, unknownHolder)).resolves.toEqual({ kind: 'refused' })
    await expect(subject.producer(acting, unknownProducer)).resolves.toEqual({ kind: 'refused' })
    await expect(
      subject.holder(acting, { kind: 'revoke', eligibility: { eligibility: 'e-1' } }),
    ).resolves.toEqual({ kind: 'refused' })
  })

  it('answers unavailable when the verifier is down or throws, never refused or authorized, and reports no message', async () => {
    const { acting } = authorityWithActing('session-ad03', tenantA)
    const throwing: PrincipalVerifier = {
      verify: () => Promise.reject(new Error('verifier secret')),
    }
    const down: PrincipalVerifier = {
      verify: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'verifier down' }),
    }
    const thrown = createRuntimeContextAuthority({ verifier: throwing })
    const decision = await thrown.producer(acting, producerActions(tenantA)[0]!)
    expect(decision).toEqual({ kind: 'unavailable' })
    expect(JSON.stringify(decision)).not.toContain('secret')
    expect(await kinds(createRuntimeContextAuthority({ verifier: down }), acting, tenantA)).toEqual(
      new Set(['unavailable']),
    )
  })
})

describe('the two absent ports', () => {
  it('bindings: every scope, Session-shaped or forged, is unavailable; never bound, never unbound', async () => {
    await expect(unavailableScopeBindings.lookup(scope)).resolves.toEqual({ kind: 'unavailable' })
    await expect(unavailableScopeBindings.lookup(scopeOf('forged'))).resolves.toEqual({
      kind: 'unavailable',
    })
  })

  it('replayFacts: unavailable, and the diagnostic names the AD-03 holder and its wave-2 key', async () => {
    await expect(absentReplayFacts.stepCommittedBlocks(scope, null)).resolves.toEqual({
      kind: 'unavailable',
    })
    expect(absentReplayFacts.diagnostic).toContain('session-ad03')
    expect(absentReplayFacts.diagnostic).toContain('sessionReplayFacts')
  })
})

type Installed = Readonly<{
  trust: Context
  acting: Principal
  /** Loads a reader fiber on the trusted scope that asks one producer decision through the service. */
  reader(): Promise<Readonly<{ decision: AuthorityDecision<unknown>; dispose(): Promise<void> }>>
}>

async function installed(): Promise<Installed> {
  const fixture = fixtureEnv([runtimeContextTrustKey, principalIssuerKey])
  await fixture.install(principalIssuer)
  await fixture.install(runtimeContextTrust)
  const issuer = got(fixture.scopeOf(principalIssuerKey).get(principalIssuerKey), 'principalIssuer')
  const actor = okOf(issuer.issueSystem({ component: 'session-ad03' }), 'actor')
  const acting = okOf(
    issuer.issueActingForTenant({
      actor,
      tenant: tenantA,
      work: { owner: 'session', work: 'ses_1' },
    }),
    'acting principal',
  )
  const trust = fixture.scopeOf(runtimeContextTrustKey)
  expect(fixture.root.get(runtimeContextTrustKey)).toBeUndefined()
  return {
    trust,
    acting,
    async reader() {
      let asked: Promise<AuthorityDecision<unknown>> | undefined
      const fiber = trust.plugin({
        name: 'probe-reader',
        inject: [runtimeContextTrustKey],
        apply(ctx: Context) {
          const service = got(ctx.get(runtimeContextTrustKey), 'runtimeContextTrust')
          expect(service).toBeInstanceOf(RuntimeContextTrustService)
          asked = service.authority.producer(acting, producerActions(tenantA)[0]!)
        },
      })
      await fiber
      if (asked === undefined) throw new Error('fixture: the reader did not ask')
      return { decision: await asked, dispose: () => fiber.dispose() }
    },
  }
}

describe('the installed `runtimeContextTrust`', () => {
  it('is a subclass of the definition on the trusted scope only, and authorizes through the service', async () => {
    const { reader } = await installed()
    const { decision, dispose } = await reader()
    expect(decision.kind).toBe('authorized')
    if (decision.kind !== 'authorized') throw new Error('unreachable')
    expect(decision.current()).toBe(true)
    await dispose()
  })

  it('current: once the reading row fiber is disposed, its earlier answers are stale; another reader stays current', async () => {
    const { reader } = await installed()
    const first = await reader()
    const second = await reader()
    if (first.decision.kind !== 'authorized' || second.decision.kind !== 'authorized')
      throw new Error('fixture: not authorized')
    expect([first.decision.current(), second.decision.current()]).toEqual([true, true])
    await first.dispose()
    expect([first.decision.current(), second.decision.current()]).toEqual([false, true])
    await second.dispose()
    expect(second.decision.current()).toBe(false)
  })

  it('bindings through the service are unavailable, so a scope of another tenant is never answered as any tenant', async () => {
    const { trust } = await installed()
    const service = got(trust.get(runtimeContextTrustKey), 'runtimeContextTrust')
    await expect(service.bindings.lookup(scope)).resolves.toEqual({ kind: 'unavailable' })
  })
})
