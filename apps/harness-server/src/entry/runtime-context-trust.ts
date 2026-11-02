// R2-D29 narrows readers to their Session work principal and refuses all producers.
// Scope facts come from the shared application projection; absent production sources stay unavailable.
// R2-D25 current is only a caller-fiber generation bridge. It does not close #677.
import type { Context } from '@deepseek-ai/cordis'
import type {
  ActingForTenantPrincipal,
  PrincipalVerification,
  PrincipalVerifier,
} from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  Eligibility,
  HolderAction,
  HolderDecision,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextTrustService,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createSessionRuntimeContextTrust,
  type SessionReplayFacts,
} from '@omne-harness/session-adapters'
import type { EntryObjectModule } from '../types.ts'
import { verifierOf } from './principals.ts'
import type { SessionScopeOwnershipSource, SessionScopeSource } from './session-scope-source.ts'

const REFUSED: AuthorityDecision<unknown> = Object.freeze({ kind: 'refused' })
const UNAVAILABLE: AuthorityDecision<unknown> = Object.freeze({ kind: 'unavailable' })

async function verify(verifier: PrincipalVerifier, value: unknown): Promise<PrincipalVerification> {
  try {
    return await verifier.verify(value)
  } catch {
    // 核验器的消息不透传：它可能带输入正文。
    return { kind: 'unavailable', diagnostic: 'the principal verifier threw an exception' }
  }
}

/**
 * 动作类别表：每个放行的类别给出动作自己写的租户。表外的类别，以及不带租户的 `revoke`（权威无法确认主体替哪个租户
 * 撤销），都是 `undefined`，一律拒绝。
 */
function tenantOf(action: HolderAction<unknown>): TenantId | undefined {
  switch (action.kind) {
    case 'prepare':
      return action.change.tenant
    case 'commit':
      return action.input.kind === 'registration' ? action.input.change.tenant : action.input.tenant
    case 'issue':
      return action.material.tenant
    case 'begin-replay':
    case 'finish-replay':
      return action.tenant
    case 'revoke':
      return undefined
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

export type RuntimeContextAuthorityOptions = Readonly<{
  verifier: PrincipalVerifier
  scopeOwners?: SessionScopeOwnershipSource | undefined
}>

async function readerScopeDecision(
  options: RuntimeContextAuthorityOptions,
  verified: ActingForTenantPrincipal,
  tenant: TenantId,
  scope: ScopeRef,
): Promise<AuthorityDecision<unknown>> {
  try {
    const owner = await options.scopeOwners?.lookup(scope)
    if (owner === undefined || owner.kind === 'unavailable') return UNAVAILABLE
    if (owner.kind === 'unknown') return { kind: 'unknown' }
    if (
      owner.kind !== 'bound' ||
      !tenantEquals(owner.tenant, tenant) ||
      owner.session !== verified.work.work
    )
      return REFUSED
    return { kind: 'authorized', principal: verified, current: () => true }
  } catch {
    return UNAVAILABLE
  }
}

/**
 * Identity verification precedes policy. Holders retain their action table; readers need their Session.
 * The service composition adds caller-fiber currentness to authorized decisions.
 */
export function createRuntimeContextAuthority(
  options: RuntimeContextAuthorityOptions,
): RuntimeContextAuthority<unknown> {
  async function decide(
    principal: unknown,
    tenant: TenantId | undefined,
  ): Promise<AuthorityDecision<unknown>> {
    const verification = await verify(options.verifier, principal)
    if (verification.kind === 'unavailable') return UNAVAILABLE
    if (verification.kind === 'rejected') return REFUSED
    const verified = verification.principal
    if (verified.kind !== 'acting-for-tenant') return REFUSED
    if (tenant === undefined || !tenantEquals(verified.tenant, tenant)) return REFUSED
    return { kind: 'authorized', principal: verified, current: () => true }
  }
  return Object.freeze({
    holder(principal: unknown, action: HolderAction<unknown>): Promise<HolderDecision<unknown>> {
      return decide(principal, tenantOf(action))
    },
    async producer(principal: unknown): Promise<AuthorityDecision<unknown>> {
      const verification = await verify(options.verifier, principal)
      return verification.kind === 'unavailable' ? UNAVAILABLE : REFUSED
    },
    async reader(
      principal: unknown,
      eligibility: Eligibility<unknown>,
    ): Promise<AuthorityDecision<unknown>> {
      const tenant = eligibility.tenant
      const scope = Object.freeze({ ref: eligibility.scope.ref })
      const verification = await verify(options.verifier, principal)
      if (verification.kind === 'unavailable') return UNAVAILABLE
      if (verification.kind === 'rejected') return REFUSED
      const verified = verification.principal
      if (verified.kind !== 'acting-for-tenant' || !tenantEquals(verified.tenant, tenant))
        return REFUSED
      if (verified.actor.component !== 'sessionWorkPrincipals' || verified.work.owner !== 'session')
        return REFUSED
      return readerScopeDecision(options, verified, tenant, scope)
    },
  })
}

/** 作用域绑定：入口解码不了 Session 的作用域摘要，一律不可用；不猜租户，不答未绑定。 */
export const unavailableScopeBindings: ScopeBindingSource = Object.freeze({
  lookup: () => Promise.resolve({ kind: 'unavailable' as const }),
})

/** 持有者事实：`session-ad03` 未交付，一律不可用。`diagnostic` 只给装配者看，不进任何答复。 */
export const absentReplayFacts: SessionReplayFacts & Readonly<{ diagnostic: string }> =
  Object.freeze({
    diagnostic:
      'the assembly entry has no session replay facts; the AD-03 holder of row session-ad03 provides them (service key sessionReplayFacts in wave 2) and that row is not delivered',
    stepCommittedBlocks: () => Promise.resolve({ kind: 'unavailable' as const }),
  })

/** 一个读取方 fiber 的代次：`retired` 一旦为真就不再为假。 */
type Generation = { retired: boolean }

type TrustState = Readonly<{
  verifier: PrincipalVerifier
  scopes: SessionScopeSource | undefined
  currents: WeakMap<Context, () => boolean>
  /** 读取方上下文 → 绑定了该读取方代次的信任对象。 */
  byReader: WeakMap<Context, RuntimeContextTrust<unknown>>
}>

/** 为一个读取方上下文组合信任对象：代次随该上下文的 fiber 撤除而退役。 */
function trustFor(state: TrustState, reader: Context): RuntimeContextTrust<unknown> {
  const made = state.byReader.get(reader)
  if (made !== undefined) return made
  const current = currentForReader(state.currents, reader)
  const trust = createSessionRuntimeContextTrust<unknown>({
    authority: createRuntimeContextAuthority({
      verifier: state.verifier,
      scopeOwners: state.scopes?.scopeOwners,
    }),
    bindings: state.scopes?.bindings ?? unavailableScopeBindings,
    current: { capture: () => ({ current }) },
    replayFacts: absentReplayFacts,
  })
  state.byReader.set(reader, trust)
  return trust
}

class EntryRuntimeContextTrust extends RuntimeContextTrustService<unknown> {
  readonly state: TrustState
  constructor(ctx: Context, verifier: PrincipalVerifier, scopes?: SessionScopeSource) {
    super(ctx)
    this.state = { verifier, scopes, currents: new WeakMap(), byReader: new WeakMap() }
  }
  /** 访问器，不是字段：`this.ctx` 是读取方的上下文，代次绑定到它的 fiber。 */
  get authority(): RuntimeContextTrust<unknown>['authority'] {
    return trustFor(this.state, this.ctx).authority
  }
  get bindings(): RuntimeContextTrust<unknown>['bindings'] {
    return trustFor(this.state, this.ctx).bindings
  }
}

export function createRuntimeContextTrustModule(scopes?: SessionScopeSource): EntryObjectModule {
  return {
    name: runtimeContextTrustKey,
    implementation: 'real',
    install(scope, env) {
      new EntryRuntimeContextTrust(scope, verifierOf(env), scopes)
    },
  }
}

export const runtimeContextTrust = createRuntimeContextTrustModule()

/** Captures a caller fiber before the first await; retirement is irreversible. */
export function currentForReader(
  readers: WeakMap<Context, () => boolean>,
  reader: Context,
): () => boolean {
  const found = readers.get(reader)
  if (found !== undefined) return found
  const generation: Generation = { retired: false }
  reader.effect(
    () => () => {
      generation.retired = true
    },
    'entryAuthority.generation',
  )
  const current = () => !generation.retired
  readers.set(reader, current)
  return current
}
