// `runtimeContextTrust`（AA 运行时对象表「运行时上下文信任」、R2-D5、R2-D7、DP2-2 §5）：受信名，只有 `runtime-context`
// 行看得见。内容由 `createSessionRuntimeContextTrust` 组合四个端口，每个端口取最小诚实实现，不改任何契约：
//
// - `authority`：照 `request-context-trust.ts` 的次序。核验器先答（不可用或抛出答 `unavailable`，不改写成拒绝）；
//   只放行代租户行事主体；主体的租户必须等于动作自己写的租户；再按动作类别放行（`tenantOf` 的表）。表外的动作
//   类别与不带租户的 `revoke` 一律 `refused`。默认拒绝。
// - `bindings`：一律 `unavailable`。作用域文本是 Session 核心铸造的单向摘要（session-contract
//   `decide-management.ts` 的 `scopeBinding`：`session-scope:<sha256(tenant, session, generation)>`），入口解码不了；
//   作用域到会话的索引是 AD-03 持有者自己的派生物（session-adapters `context-holder.ts`），成员不导出，这里不复制。
//   `unavailable` 让 Runtime Context 对每个带目标的操作答 `unavailable`（cause `scope-binding`），不放行。
// - `replayFacts`：一律 `unavailable`。它由 `session-ad03` 的持有者提供（波 2 换成服务键 `sessionReplayFacts`），
//   该行未交付。只有完成的恢复才问它，`create` 不问。
// - `current`：进程代次桥。`authority` 与 `bindings` 是访问器：读取方经自己的 ctx 取到本服务时，访问器里的
//   `this.ctx` 是读取方的上下文（Cordis 4.0.4，`.meta_harness/design/basis/cordis/service-method-ctx-is-caller.md`），
//   所以每个读取方的 fiber 得到一个代次，经 `this.ctx.effect` 登记的撤除在该 fiber 撤除（行重载，或装配关闭撤除整棵
//   树）时让这一代退役：此前经它取得的 `current()` 全部为假，之后也不会再真。这是已知限制，不闭合 #677：撤权、原工作
//   失效与 Request Context 换代都没有同步来源到达这座桥（runtime-context-contract SPEC「明确缺项」）。
//
// 本模块不签发主体，不持有签发者；核验器经 `principals.ts` 的 `verifierOf` 取得。类里不用 `#` 私有字段，可变状态放在
// 对象里：经调用方代理调用时 `this` 不是实例本身（同 `storage-host.ts`）。
import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalVerification, PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type {
  AuthorityDecision,
  Eligibility,
  HolderAction,
  HolderDecision,
  ProducerAction,
  RuntimeContextAuthority,
  RuntimeContextTrust,
  ScopeBindingSource,
} from '@omne-harness/runtime-context-contract'
import {
  RuntimeContextTrustService,
  runtimeContextTrustKey,
} from '@omne-harness/runtime-context-cordis-contract/cordis'
import {
  createSessionRuntimeContextTrust,
  type RuntimeContextCurrentBridge,
  type SessionReplayFacts,
} from '@omne-harness/session-adapters'
import type { EntryObjectModule } from '../types.ts'
import { verifierOf } from './principals.ts'

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
function tenantOf(action: HolderAction<unknown> | ProducerAction): TenantId | undefined {
  switch (action.kind) {
    case 'prepare':
      return action.change.tenant
    case 'commit':
      return action.input.kind === 'registration' ? action.input.change.tenant : action.input.tenant
    case 'issue':
      return action.material.tenant
    case 'begin-replay':
    case 'finish-replay':
    case 'register':
    case 'publish':
    case 'invalidate':
    case 'supply':
    case 'invalidate-tenant':
      return action.tenant
    case 'revoke':
      return undefined
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

export type RuntimeContextAuthorityOptions = Readonly<{ verifier: PrincipalVerifier }>

/**
 * 纯组合：核验器由调用方给。次序同 DP5-C2：1. 核验器先答；2. 只放行代租户行事主体；3. 主体的租户等于动作里的租户；
 * 4. 动作类别在表内。已授权的 `current()` 在这里恒真：当前性由代次桥在 `createSessionRuntimeContextTrust` 里叠加。
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
    producer(principal: unknown, action: ProducerAction): Promise<AuthorityDecision<unknown>> {
      return decide(principal, tenantOf(action))
    },
    reader(
      principal: unknown,
      eligibility: Eligibility<unknown>,
    ): Promise<AuthorityDecision<unknown>> {
      return decide(principal, eligibility.tenant)
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

function bridgeOf(generation: Generation): RuntimeContextCurrentBridge {
  return {
    capture: () => ({ current: () => !generation.retired }),
  }
}

type TrustState = Readonly<{
  verifier: PrincipalVerifier
  /** 读取方上下文 → 绑定了该读取方代次的信任对象。 */
  byReader: WeakMap<Context, RuntimeContextTrust<unknown>>
}>

/** 为一个读取方上下文组合信任对象：代次随该上下文的 fiber 撤除而退役。 */
function trustFor(state: TrustState, reader: Context): RuntimeContextTrust<unknown> {
  const made = state.byReader.get(reader)
  if (made !== undefined) return made
  const generation: Generation = { retired: false }
  reader.effect(
    () => () => {
      generation.retired = true
    },
    'runtimeContextTrust.generation',
  )
  const trust = createSessionRuntimeContextTrust<unknown>({
    authority: createRuntimeContextAuthority({ verifier: state.verifier }),
    bindings: unavailableScopeBindings,
    current: bridgeOf(generation),
    replayFacts: absentReplayFacts,
  })
  state.byReader.set(reader, trust)
  return trust
}

class EntryRuntimeContextTrust extends RuntimeContextTrustService<unknown> {
  readonly state: TrustState
  constructor(ctx: Context, verifier: PrincipalVerifier) {
    super(ctx)
    this.state = { verifier, byReader: new WeakMap() }
  }
  /** 访问器，不是字段：`this.ctx` 是读取方的上下文，代次绑定到它的 fiber。 */
  get authority(): RuntimeContextTrust<unknown>['authority'] {
    return trustFor(this.state, this.ctx).authority
  }
  get bindings(): RuntimeContextTrust<unknown>['bindings'] {
    return trustFor(this.state, this.ctx).bindings
  }
}

export const runtimeContextTrust: EntryObjectModule = {
  name: runtimeContextTrustKey,
  implementation: 'real',
  install(scope, env) {
    new EntryRuntimeContextTrust(scope, verifierOf(env))
  },
}
