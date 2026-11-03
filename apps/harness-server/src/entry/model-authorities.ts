// Model 的三个权威入口对象（AA 运行时对象表「Model 与 Tool 的原事实、权威与时钟适配对象」、Model 装配设计的三个插件 inject）：
// `modelHostAuthority` 给 `model-host`，`modelPublicationAuthority` 给 `model-instances`，`modelConverterAuthority` 给
// `model-converters`，都在根上 provide。发布与转换器登记核验对任何请求答 `denied`（入口没有预约表与采用表，不认识即拒绝；
// R2-D33 §5.3：目录发布恒 denied 不挡本地 host 的 drive）。
//
// `modelHostAuthority` 是波 2 的真件（简报 B3-M 第 4 项、`tmp/wire-model/design.md` §3）。它在自己的闭包里持有本运行的
// Model 组合（`src/model/composition.ts`），服务实例上只有 `resolve`；`model-records` 与 `model-host` 两行各经
// `src/model/ports.ts` 按根上下文取自己的窄口（附着、宿主绑定），`ctx.get` 拿不到组合的任何部分（R2-D108 B1）。`resolve` 按
// 固定次序取事实：读原受理（只在本次许可内）→ 用入口受信读取的签发者签 M → 核受理记录与 M 的关系（租户、调用、原发起者就是
// 本租户账号）→ `channel.prepare`。任一步失败答 `unavailable` 或 `denied`，不补造 ActorRef、operation 或摘要。
// 签发者只在安装时经受信名 `principalIssuer` 读一次；签发闭包固定 actor 与 `work.owner`，不交给任何行。
import type { Context } from '@deepseek-ai/cordis'
import type {
  ActingForTenantPrincipal,
  PrincipalIssuer,
  SystemPrincipal,
  TenantStandingSource,
} from '@omne-harness/identity'
import { principalIssuerKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId, ModelFailure } from '@omne-harness/model-contract'
import type { ModelHostAuthority } from '@omne-harness/model-contract/provider'
import {
  ModelConverterAuthorityService,
  ModelHostAuthorityService,
  ModelPublicationAuthorityService,
  modelConverterAuthorityKey,
  modelHostAuthorityKey,
  modelPublicationAuthorityKey,
  type ModelConverterAuthority,
  type ModelPublicationAuthority,
  type ModelRegistrationFailure,
} from '@omne-harness/model-cordis-contract/cordis'
import { fail, type Outcome } from '@omne-harness/operation-result'
import { createModelRunComposition, type ModelRunComposition } from '../model/composition.ts'
import { registerModelRowPorts } from '../model/ports.ts'
import { MODEL_HOST_COMPONENT, MODEL_WORK_OWNER } from '../model/principals.ts'
import { ACTOR_OWNER, readSubject } from '../model/qualification.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'

const DENIED: ModelRegistrationFailure = Object.freeze({ kind: 'denied' })

/** 发布权威：入口没有宿主预约表，没有一次登记是它认识的。 */
export function createModelPublicationAuthority(): ModelPublicationAuthority<unknown> {
  return Object.freeze({ check: () => fail(DENIED) })
}

/** 转换器权威：入口没有转换器采用表，没有一次登记是它认识的。 */
export function createModelConverterAuthority(): ModelConverterAuthority<unknown> {
  return Object.freeze({ check: () => fail(DENIED) })
}

/** 窄签发闭包：actor 与 `work.owner` 固定，只收租户与调用。 */
export type ModelWorkIssue = (
  input: Readonly<{ tenant: TenantId; call: ModelCallId }>,
) => Outcome<ActingForTenantPrincipal, unknown>

export type ModelHostAuthorityInput = Readonly<{
  composition: ModelRunComposition
  /** 没装好签发者时为 undefined：`resolve` 答 unavailable。 */
  issue: ModelWorkIssue | undefined
  /** 按调用现取 `tenantStanding`；缺席时 `resolve` 答 unavailable。 */
  standing(): Pick<TenantStandingSource, 'read'> | undefined
}>

const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: modelHostAuthorityKey,
  diagnostic,
})
const denied = (action: string): ModelFailure => ({ kind: 'denied', action })

function sameTenant(left: TenantId, right: TenantId): boolean {
  return tenantCodec.encode(left).ok && tenantCodec.encode(right).ok && tenantEquals(left, right)
}

/** 宿主权威的 `resolve`：步骤见文件头。诊断不回显调用身份。 */
export function createModelHostAuthority(
  input: ModelHostAuthorityInput,
): ModelHostAuthority<unknown> {
  const resolve: ModelHostAuthority<unknown>['resolve'] = async target => {
    const { composition } = input
    const attached = composition.attached()
    if (attached === undefined) return fail(unavailable('records-not-attached'))
    const current = composition.hostCurrent()
    if (current === undefined) return fail(unavailable('host-not-bound'))
    if (input.issue === undefined) return fail(unavailable('principal-issuer-unavailable'))
    const standing = input.standing()
    if (standing === undefined) return fail(unavailable('tenant-standing-unavailable'))

    // 1. 原受理，只在本次许可内读。
    const revoke = composition.grantOriginRead(target)
    let accepted: Awaited<ReturnType<typeof attached.initial.readAcceptance>>
    try {
      accepted = await attached.initial.readAcceptance(target)
    } catch {
      return fail(unavailable('acceptance-read-threw'))
    } finally {
      revoke()
    }
    if ('failure' in accepted)
      return accepted.failure.kind === 'commit-unknown'
        ? fail(unavailable('acceptance-commit-unknown'))
        : accepted

    // 2. 签 M。
    const issued = input.issue({ tenant: accepted.ok.tenant, call: accepted.ok.call })
    if ('failure' in issued) return fail(unavailable('principal-issue-refused'))
    const principal = issued.ok

    // 3. 核关系：租户、调用、原发起者就是本租户账号。
    if (!sameTenant(accepted.ok.tenant, target.tenant) || accepted.ok.call !== target.call)
      return fail(denied('model-host-resolve'))
    const subject = await readSubject(standing, accepted.ok.tenant)
    if (subject.kind === 'unavailable') return fail(unavailable(subject.diagnostic))
    if (subject.kind === 'not-member') return fail(denied('model-host-resolve'))
    const { initiator } = accepted.ok
    if (initiator.owner !== ACTOR_OWNER || initiator.subject !== subject.actor.subject)
      return fail(denied('model-host-resolve'))
    const withdraw = attached.qualification.captureHost({
      principal,
      tenant: accepted.ok.tenant,
      call: accepted.ok.call,
      actor: subject.actor,
      current,
    })

    // 4. 通道 prepare：首次生成或认回 operation 与 continuity。
    const channel = composition.executionChannel()
    if ('failure' in channel) {
      withdraw()
      return channel
    }
    let prepared: Awaited<ReturnType<typeof channel.ok.prepare>>
    try {
      prepared = await channel.ok.prepare({
        tenant: accepted.ok.tenant,
        call: accepted.ok.call,
        principal,
      })
    } catch {
      withdraw()
      return fail(unavailable('channel-prepare-threw'))
    }
    if ('failure' in prepared) {
      withdraw()
      return prepared
    }
    attached.qualification.recordHostBinding({
      tenant: accepted.ok.tenant,
      call: accepted.ok.call,
      instance: prepared.ok.instance,
      operation: prepared.ok.operation,
      current,
    })
    return prepared
  }
  return Object.freeze({ resolve })
}

class EntryModelPublicationAuthority extends ModelPublicationAuthorityService<unknown> {
  readonly check: ModelPublicationAuthority<unknown>['check']
  constructor(ctx: Context, authority: ModelPublicationAuthority<unknown>) {
    super(ctx)
    this.check = input => authority.check(input)
  }
}

class EntryModelConverterAuthority extends ModelConverterAuthorityService<unknown> {
  readonly check: ModelConverterAuthority<unknown>['check']
  constructor(ctx: Context, authority: ModelConverterAuthority<unknown>) {
    super(ctx)
    this.check = input => authority.check(input)
  }
}

/** 服务实例上只有 `resolve`；组合留在入口闭包里，不挂到任何 `ctx.get` 能到的对象上。 */
class EntryModelHostAuthority extends ModelHostAuthorityService<unknown> {
  readonly resolve: ModelHostAuthority<unknown>['resolve']
  constructor(ctx: Context, authority: ModelHostAuthority<unknown>) {
    super(ctx)
    this.resolve = input => authority.resolve(input)
  }
}

/** 模型宿主签发闭包：经入口受信读取的签发者签系统 actor，再固定它与 `work.owner`。签发者缺席时为 undefined。 */
function modelWorkIssuerOf(env: EntryEnv): ModelWorkIssue | undefined {
  const issuer: PrincipalIssuer | undefined = env
    .readTrusted(principalIssuerKey)
    .get(principalIssuerKey)
  if (issuer === undefined) return undefined
  const actor = issuer.issueSystem({ component: MODEL_HOST_COMPONENT })
  if ('failure' in actor) return undefined
  const system: SystemPrincipal = actor.ok
  return ({ tenant, call }) =>
    issuer.issueActingForTenant({
      actor: system,
      tenant,
      work: { owner: MODEL_WORK_OWNER, work: call },
    })
}

const COMPOSITION = Symbol('harness-server/model-run-composition')

export const modelPublicationAuthority: EntryObjectModule = {
  name: modelPublicationAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelPublicationAuthority(scope, createModelPublicationAuthority())
  },
}

export const modelConverterAuthority: EntryObjectModule = {
  name: modelConverterAuthorityKey,
  implementation: 'real',
  install(scope) {
    new EntryModelConverterAuthority(scope, createModelConverterAuthority())
  },
}

export const modelHostAuthority: EntryObjectModule = {
  name: modelHostAuthorityKey,
  implementation: 'real',
  install(scope, env) {
    const composition = env.once(COMPOSITION, createModelRunComposition)
    registerModelRowPorts(scope, { records: composition.records, host: composition.host })
    const issue = modelWorkIssuerOf(env)
    if (issue === undefined)
      scope
        .logger('model-host-authority')
        .warn('the trusted principal issuer is not installed; no model call can be resolved')
    const authority = createModelHostAuthority({
      composition,
      issue,
      standing: () => scope.get(tenantStandingKey),
    })
    new EntryModelHostAuthority(scope, authority)
  },
}
