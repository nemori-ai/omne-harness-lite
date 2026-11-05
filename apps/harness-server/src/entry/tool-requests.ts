// 可信的 Tool 请求供给者（R2-D36 第 2、3 点，B 段）：Agent 宿主的构造依赖，不是服务键。给定一个已准入的动作，
// 返回完整的 `ToolInvokeRequest`；任何来源缺席或不一致都答 unavailable 或 denied，不猜、不默认放行。
// 交给 agent-host 行的接口是 `toolRequestsOf: (ctx) => 来源`（SC4 的 `createAgentHostRow`）；本模块的
// `releaseToolRequestsOf` 就是这个形状，每次调用经 `ctx` 现取各来源。
//
// 每个字段的来源：
// - 主体：经 `principalVerifier` 核验（受信名，入口对象 `toolClock` 经 `env.readTrusted` 交给 Tool 共享状态的读法），
//   必须是这个租户的会话工作主体；判定只有一份，在
//   `rows/tool-runtime/session-work.ts`，与 Tool 运行时的身份一侧同口径。它的工作文本就是会话 id。其余主体答
//   denied，核验器缺席答 unavailable。
// - 定义与可用性：`toolCatalog.inspect`。模型看到的名字就是工具名（`declare-tools.ts`，D-94）；多命令工具的
//   命令从生效参数的 `command` 选出，见 `commandOf`。消费者材料是发行清单确认的文本消费者。
//   不在发行清单里、不是官方层、不是 `available` 的答 unavailable；prepare 时定义采用必须与 describe 给出的相同。
// - requesterScope：会话的当前 Context 作用域，即会话快照 `contextScopes` 的最新一条，未结束（与 AD-04 历史源
//   的读法相同）。会话以 `coordinator` 调用方类读取（见 `sessionWorkReaderOf`），访问裁定照常；读不到或作用域
//   已结束答 unavailable。
// - 作用域归属：经执行环境的可信作用域绑定（入口对象 `executionScopeBinding`）核对作用域绑定在这个租户；
//   绑定缺席或不明答 unavailable，绑定到别的租户或未绑定答 denied。
// - 设置采用：发行清单里这个作者的固定设置采用。并发作用域：发行唯一的作用域（`rows/tool-runtime/scope.ts`）。
// - workspace 为 null（本发行没有工作区身份，不猜）；resources 为空；前台执行；不加请求级的并发与时限。
import type { Context } from '@deepseek-ai/cordis'
import type { Failure } from '@omne-harness/agent-contract'
import type { AgentHostLocalPluginInput } from '@omne-harness/agent-host-local/cordis'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { writeJsonText } from '@omne-harness/json-text'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeScopeRef,
  type ScopeBindingSource,
  type ScopeRef,
} from '@omne-harness/runtime-context-contract'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import {
  describeCommandCallRejection,
  selectCommandText,
  type ToolAvailability,
  type ToolCatalog,
  type ToolConsumerProfile,
  type ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import { toolCatalogKey } from '@omne-harness/tool-cordis-contract/cordis'
import { toolRuntimeHolder } from '../rows/tool-runtime/holder.ts'
import { RELEASE_REQUEST_CONTEXT, RELEASE_TOOL_SCOPE } from '../rows/tool-runtime/scope.ts'
import { verifySessionWork } from '../rows/tool-runtime/session-work.ts'
import { releaseOf, type ToolRelease } from './tool-release.ts'

/** `createAgentHostRow({ toolRequestsOf })` 期望的来源形状（Agent `AgentDependencies['toolRequests']`）。 */
export type ReleaseToolRequests = NonNullable<AgentHostLocalPluginInput['toolRequests']>
type DescribeInput = Parameters<ReleaseToolRequests['describe']>[0]
type PrepareInput = Parameters<ReleaseToolRequests['prepare']>[0]

/** 来源的拥有者名，写在 unavailable 里。 */
export const TOOL_REQUESTS_OWNER = 'agentToolRequests'

/** 供给者读的五个来源，每次调用现取；返回 undefined 表示缺席。 */
export type ToolRequestPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  catalog(): ToolCatalog<unknown> | undefined
  /** 以 `coordinator` 调用方类读会话快照；会话服务缺席时为 undefined。 */
  readWork(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<WorkSnapshot, SessionFailure>> | undefined
  scopeBinding(): ScopeBindingSource | undefined
  release(): ToolRelease
}>

const unavailable = (diagnostic: string) =>
  fail<Failure>({ kind: 'unavailable', owner: TOOL_REQUESTS_OWNER, diagnostic })
const denied = (action: string) => fail<Failure>({ kind: 'denied', action })

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>

/**
 * 模型看到的声明名就是工具名（D-94）。多命令工具从生效参数里选命令：点名已知命令的调用都送到该命令，
 * 参数不合由工具宿主答出原因与该命令的 guide；没点名已知命令的调用不运行，来源直接作答，
 * 答复是原因与工具的 guide（D-104）。
 */
function commandOf(
  definition: ToolAvailability['definition'],
  effectiveArguments: string,
): Readonly<{ command: string | null }> | Readonly<{ answer: string }> {
  if (definition.kind === 'function') return { command: null }
  const selected = selectCommandText(
    definition.commands.map(command => command.name),
    effectiveArguments,
  )
  return 'failure' in selected
    ? { answer: describeCommandCallRejection(definition, selected.failure) }
    : { command: selected.ok }
}

/** 主体经核验是这个租户的会话工作主体时给出会话 id（判定只有 `session-work.ts` 一份）。 */
async function sessionOf(
  ports: ToolRequestPorts,
  principal: unknown,
  tenant: TenantId,
): Promise<Outcome<SessionId, Failure>> {
  const verdict = await verifySessionWork(ports.verifier(), principal, tenant)
  switch (verdict.kind) {
    case 'unavailable':
      return unavailable(verdict.diagnostic)
    case 'denied':
      return denied('tool-request')
    default:
      // The work text of a session work principal is the session id that Session gave when it issued it.
      return succeed(verdict.session as SessionId)
  }
}

function consumerOf(release: Trusted): ToolConsumerProfile {
  const { capabilities, conversion, attachmentAccess } = release.manifest.consumer
  return { capabilities, conversion, attachmentAccess }
}

/** 目录里这个名字的当前可用定义：必须是发行清单里的官方工具。 */
async function availabilityOf(
  ports: ToolRequestPorts,
  release: Trusted,
  input: DescribeInput,
): Promise<
  Outcome<
    | (Extract<ToolAvailability, { kind: 'available' }> & { command: string | null })
    | Readonly<{ kind: 'answered'; text: string }>,
    Failure
  >
> {
  const catalog = ports.catalog()
  if (catalog === undefined) return unavailable('tool catalog absent')
  const name = input.original.name
  if (!release.manifest.entries.some(entry => entry.asset.name === name))
    return unavailable(`${name} is not a release tool`)
  let answer: Awaited<ReturnType<ToolCatalog<unknown>['inspect']>>
  try {
    answer = await catalog.inspect({
      principal: input.principal,
      tenant: input.tenant,
      name,
      command: null,
      consumer: consumerOf(release),
    })
  } catch {
    return unavailable('tool catalog threw')
  }
  if ('failure' in answer)
    return answer.failure.kind === 'denied'
      ? denied('tool-request')
      : unavailable(`tool catalog answered ${answer.failure.kind}`)
  const availability = answer.ok
  if (availability.kind !== 'available' || availability.layer.kind !== 'official')
    return unavailable(`${name} is not available`)
  const selected = commandOf(availability.definition, input.effectiveArguments)
  return succeed(
    'answer' in selected
      ? { kind: 'answered', text: selected.answer }
      : { ...availability, command: selected.command },
  )
}

/** 会话快照里当前（最后一个、未结束的）Context 作用域。 */
async function sessionScope(
  ports: ToolRequestPorts,
  tenant: TenantId,
  principal: unknown,
  session: SessionId,
): Promise<Outcome<ScopeRef, Failure>> {
  let read: Outcome<WorkSnapshot, SessionFailure> | undefined
  try {
    read = await ports.readWork({ principal, tenant, session })
  } catch {
    return unavailable('session read threw')
  }
  if (read === undefined) return unavailable('session absent')
  if ('failure' in read)
    return read.failure.kind === 'denied'
      ? denied('tool-request')
      : unavailable(`session read answered ${read.failure.kind}`)
  const binding = read.ok.contextScopes?.at(-1)
  if (binding === undefined) return unavailable('the session has no context scope')
  if (binding.ended !== null) return unavailable('the context scope of the session has ended')
  const scope = decodeScopeRef({ ref: binding.scope })
  return 'failure' in scope ? unavailable('the context scope is not a scope ref') : scope
}

/** 作用域经可信绑定属于这个租户；绑定缺席或不明答 unavailable，未绑定或绑到别的租户答 denied。 */
async function tenantScope(
  ports: ToolRequestPorts,
  tenant: TenantId,
  scope: ScopeRef,
): Promise<Outcome<ScopeRef, Failure>> {
  const bindings = ports.scopeBinding()
  if (bindings === undefined) return unavailable('execution scope binding absent')
  let bound: Awaited<ReturnType<ScopeBindingSource['lookup']>>
  try {
    bound = await bindings.lookup(scope)
  } catch {
    return unavailable('execution scope binding threw')
  }
  switch (bound.kind) {
    case 'bound':
      return tenantEquals(bound.tenant, tenant) ? succeed(scope) : denied('tool-request-scope')
    case 'unbound':
      return denied('tool-request-scope')
    default:
      return unavailable(`execution scope binding answered ${bound.kind}`)
  }
}

/** 会话的当前 Context 作用域，且它经可信绑定属于这个租户。 */
async function currentScope(
  ports: ToolRequestPorts,
  tenant: TenantId,
  principal: unknown,
  session: SessionId,
): Promise<Outcome<ScopeRef, Failure>> {
  const scope = await sessionScope(ports, tenant, principal, session)
  return 'failure' in scope ? scope : tenantScope(ports, tenant, scope.ok)
}

export function createReleaseToolRequests(ports: ToolRequestPorts): ReleaseToolRequests {
  const trusted = (): Outcome<Trusted, Failure> => {
    const release = ports.release()
    return release.kind === 'trusted'
      ? succeed(release)
      : unavailable('release snapshot unavailable')
  }

  const describe: ReleaseToolRequests['describe'] = async input => {
    const release = trusted()
    if ('failure' in release) return release
    const session = await sessionOf(ports, input.principal, input.tenant)
    if ('failure' in session) return session
    const availability = await availabilityOf(ports, release.ok, input)
    if ('failure' in availability) return availability
    return succeed(
      availability.ok.kind === 'answered' ? availability.ok : availability.ok.definition.adoption,
    )
  }

  const prepare: ReleaseToolRequests['prepare'] = async (input: PrepareInput) => {
    const release = trusted()
    if ('failure' in release) return release
    const session = await sessionOf(ports, input.principal, input.tenant)
    if ('failure' in session) return session
    const found = await availabilityOf(ports, release.ok, input)
    if ('failure' in found) return found
    // An answered call is never prepared: describe answered it already.
    if (found.ok.kind === 'answered') return unavailable('the call names no command of the tool')
    const { command, ...availability } = found.ok
    if (canonicalDigest(availability.definition.adoption) !== canonicalDigest(input.definition))
      return unavailable('the current definition differs from the described one')
    const entry = release.ok.manifest.entries.find(
      candidate => candidate.asset.name === availability.definition.name,
    )
    if (entry === undefined) return unavailable('release entry absent')
    const scope = await currentScope(ports, input.tenant, input.principal, session.ok)
    if ('failure' in scope) return scope
    let original: string
    try {
      original = writeJsonText(input.original.arguments)
    } catch {
      return fail({ kind: 'invalid', field: 'original.arguments', reason: 'not-json' })
    }
    const request: ToolInvokeRequest = {
      availability,
      command,
      arguments: { original, effective: input.effectiveArguments, complete: true },
      settings: entry.settings,
      context: RELEASE_REQUEST_CONTEXT,
      workspace: null,
      environment: availability.definition.declarations.environment,
      requesterScope: scope.ok,
      resources: [],
      scope: RELEASE_TOOL_SCOPE,
      consumer: input.consumer,
      batchDecision: null,
      mode: 'foreground',
      limits: { concurrency: null, foregroundMs: null, backgroundAfterMs: null },
    }
    return succeed(request)
  }

  return Object.freeze({ describe, prepare })
}

/**
 * 来源读会话快照的读口：以 Session 的 `coordinator` 调用方类调用 `work.readWork`（`ctx.intercept`），访问裁定照常。
 * 依据：来源在 Run 推进中代 Agent 为 Tool 消费准备请求，主体是会话工作主体；Session 的 Cordis 定义把
 * 「Model 与 Tool 的消费适配插件」列为 `coordinator`，`reader` 只做历史读取。Session 的 `readWork` 只接受
 * `coordinator` 与 `maintainer`（session `callers.ts`），以 `reader` 调用会被拒绝（R2-D266 第十七层）。
 */
export function sessionWorkReaderOf(ctx: Context): ToolRequestPorts['readWork'] {
  const coordinator = ctx.intercept(sessionKey, { caller: 'coordinator' })
  return access => coordinator.get(sessionKey)?.work.readWork(access)
}

/** 交给 `createAgentHostRow({ toolRequestsOf })` 的生产组合：各来源经 `ctx` 逐次现取。 */
export function releaseToolRequestsOf(ctx: Context): ReleaseToolRequests {
  return createReleaseToolRequests({
    // The entry's trusted verifier read, handed over by the entry object `toolClock` (R2-D203 P-9).
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    catalog: () => ctx.get(toolCatalogKey),
    readWork: sessionWorkReaderOf(ctx),
    scopeBinding: () => ctx.get(executionScopeBindingKey),
    release: () => releaseOf(ctx),
  })
}
