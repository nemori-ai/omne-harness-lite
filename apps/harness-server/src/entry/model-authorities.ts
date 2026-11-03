// Model 的三个权威入口对象（AA 运行时对象表「Model 与 Tool 的原事实、权威与时钟适配对象」、Model 装配设计的三个插件 inject）：
// `modelHostAuthority` 给 `model-host`，`modelPublicationAuthority` 给 `model-instances`，`modelConverterAuthority` 给
// `model-converters`，都在根上 provide。发布与转换器登记核验对任何请求答 `denied`（入口没有预约表与采用表，不认识即拒绝；
// R2-D33 §5.3：目录发布恒 denied 不挡本地 host 的 drive）。
//
// `modelHostAuthority` 是波 2 的真件（简报 B3-M 第 4 项、`tmp/wire-model/design.md` §3）。它在自己的闭包里持有本运行的
// Model 组合（`src/model/composition.ts`），服务实例上只有 `resolve`；`model-records` 与 `model-host` 两行各经
// `src/model/ports.ts` 按根上下文取自己的窄口（附着、宿主绑定），`ctx.get` 拿不到组合的任何部分（R2-D108 B1）。`resolve` 按
// 固定次序取事实：读原受理（只在本次许可内）→ 核受理记录的关系（租户、调用、原发起者就是本租户账号）→ 用入口受信读取的
// 签发者签 M → `channel.prepare`。关系核对在签发之前（ID-16：核对失败、依据不可得时不得签发），所以关系不成立的请求不会
// 让签发者签出任何主体。任一步失败答 `unavailable` 或 `denied`，不补造 ActorRef、operation 或摘要。
// 签发者只在安装时经受信名 `principalIssuer` 读一次；签发闭包固定 actor 与 `work.owner`，不交给任何行。
import type { Context } from '@deepseek-ai/cordis'
import type {
  ActingForTenantPrincipal,
  PrincipalIssuer,
  SystemPrincipal,
  TenantStandingSource,
} from '@omne-harness/identity'
import { principalIssuerKey, tenantStandingKey } from '@omne-harness/identity/cordis'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ModelCallId, ModelFailure } from '@omne-harness/model-contract'
import type {
  ActorRef,
  ModelDriveInput,
  ModelHostAuthority,
} from '@omne-harness/model-contract/provider'
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
import type {
  InitialTarget,
  ModelAcceptedOrigin,
  ModelInitialExecution,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createModelRunComposition,
  type ModelRecordsAttachment,
  type ModelRunComposition,
} from '../model/composition.ts'
import { registerModelRowPorts } from '../model/ports.ts'
import { MODEL_HOST_COMPONENT, MODEL_WORK_OWNER } from '../model/principals.ts'
import { ACTOR_OWNER, readSubject } from '../model/qualification.ts'
import { sameTenant } from '../model/tenant-call.ts'
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

type Ready = Readonly<{
  attached: ModelRecordsAttachment
  current: () => boolean
  issue: ModelWorkIssue
  standing: Pick<TenantStandingSource, 'read'>
}>

/** 前提：记录行已附着、宿主已绑定、签发者与 standing 来源在场。缺任一项答 `unavailable`。 */
function readiness(input: ModelHostAuthorityInput): Outcome<Ready, ModelFailure> {
  const attached = input.composition.attached()
  if (attached === undefined) return fail(unavailable('records-not-attached'))
  const current = input.composition.hostCurrent()
  if (current === undefined) return fail(unavailable('host-not-bound'))
  if (input.issue === undefined) return fail(unavailable('principal-issuer-unavailable'))
  const standing = input.standing()
  if (standing === undefined) return fail(unavailable('tenant-standing-unavailable'))
  return succeed({ attached, current, issue: input.issue, standing })
}

/** 第 1 步：原受理，只在本次许可内读。`commit-unknown` 答 `unavailable`，别的失败原样返回。 */
async function readOrigin(
  composition: ModelRunComposition,
  initial: ModelInitialExecution<unknown>,
  target: InitialTarget,
): Promise<Outcome<ModelAcceptedOrigin, ModelFailure>> {
  const revoke = composition.grantOriginRead(target)
  let accepted: Awaited<ReturnType<typeof initial.readAcceptance>>
  try {
    accepted = await initial.readAcceptance(target)
  } catch {
    return fail(unavailable('acceptance-read-threw'))
  } finally {
    revoke()
  }
  if ('failure' in accepted && accepted.failure.kind === 'commit-unknown')
    return fail(unavailable('acceptance-commit-unknown'))
  return accepted
}

/** 第 2 步：受理记录的租户与调用等于请求，租户是成员，原发起者就是本租户账号。通过后给出主体引用。 */
async function checkRelation(
  standing: Pick<TenantStandingSource, 'read'>,
  accepted: ModelAcceptedOrigin,
  target: InitialTarget,
): Promise<Outcome<ActorRef, ModelFailure>> {
  if (!sameTenant(accepted.tenant, target.tenant) || accepted.call !== target.call)
    return fail(denied('model-host-resolve'))
  const subject = await readSubject(standing, accepted.tenant)
  if (subject.kind === 'unavailable') return fail(unavailable(subject.diagnostic))
  if (subject.kind === 'not-member') return fail(denied('model-host-resolve'))
  const { initiator } = accepted
  if (initiator.owner !== ACTOR_OWNER || initiator.subject !== subject.actor.subject)
    return fail(denied('model-host-resolve'))
  return succeed(subject.actor)
}

/** 第 4 步：通道 prepare，首次生成或认回 operation 与 continuity。失败撤掉 M 的登记并原样返回。 */
async function prepareOnChannel(
  composition: ModelRunComposition,
  ready: Ready,
  access: Readonly<{ principal: object; tenant: TenantId; call: ModelCallId; actor: ActorRef }>,
): Promise<Outcome<ModelDriveInput<unknown>, ModelFailure>> {
  const withdraw = ready.attached.qualification.captureHost({ ...access, current: ready.current })
  const channel = composition.executionChannel()
  if ('failure' in channel) {
    withdraw()
    return channel
  }
  let prepared: Awaited<ReturnType<typeof channel.ok.prepare>>
  try {
    prepared = await channel.ok.prepare({
      tenant: access.tenant,
      call: access.call,
      principal: access.principal,
    })
  } catch {
    withdraw()
    return fail(unavailable('channel-prepare-threw'))
  }
  if ('failure' in prepared) {
    withdraw()
    return prepared
  }
  ready.attached.qualification.recordHostBinding({
    tenant: access.tenant,
    call: access.call,
    instance: prepared.ok.instance,
    operation: prepared.ok.operation,
    current: ready.current,
  })
  return prepared
}

/** 宿主权威的 `resolve`：前提 → 读原受理 → 核关系 → 签 M → prepare。诊断不回显调用身份。 */
export function createModelHostAuthority(
  input: ModelHostAuthorityInput,
): ModelHostAuthority<unknown> {
  const resolve: ModelHostAuthority<unknown>['resolve'] = async target => {
    const ready = readiness(input)
    if ('failure' in ready) return ready
    const accepted = await readOrigin(input.composition, ready.ok.attached.initial, target)
    if ('failure' in accepted) return accepted
    // 2. 核关系。核对失败时没有签发过任何主体（ID-16：核对失败、依据不可得不得签发）。
    const actor = await checkRelation(ready.ok.standing, accepted.ok, target)
    if ('failure' in actor) return actor
    // 3. 关系成立后才签 M。
    const issued = ready.ok.issue({ tenant: accepted.ok.tenant, call: accepted.ok.call })
    if ('failure' in issued) return fail(unavailable('principal-issue-refused'))
    return prepareOnChannel(input.composition, ready.ok, {
      principal: issued.ok,
      tenant: accepted.ok.tenant,
      call: accepted.ok.call,
      actor: actor.ok,
    })
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
      // The entry reads its trusted name per call; a root provider of the same name is not seen.
      standing: () => env.readTrusted(tenantStandingKey).get(tenantStandingKey),
    })
    new EntryModelHostAuthority(scope, authority)
  },
}
