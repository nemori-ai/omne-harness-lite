// Tool 的 Ask 等待经 HITL 保管（细化设计 v2 §3.3）：`ToolDecisionBridge` 的实现。它是 Tool 与 HITL 的组合承担者，
// 两边都只经各自的公开端口：Tool 一侧是决策方端口、调用的恢复读、等待请求的保管与会话的工作读；HITL 一侧是
// 准备、登记与原操作查询。
//
// ensure 的步骤：
// 1. 从等待身份派生保管请求的操作（tool-host-local 的约定），读回请求原文；读回的保管证据必须等于 ensure 收到的
//    请求证据，否则答 invalid。
// 2. 从原调用取会话与 Run：会话来自调用的会话工作主体，Run 来自调用的消费者所指的 Agent 执行。
// 3. 来源 `{kind:'tool', toolCallRef, sessionRef, runRef}`；读者与答复者由注入的受众按租户与来源给出（发行注入
//    `hitlCardAudience`），没有注入答 unavailable。决策方把自己的登记主体加进读者，不加进答复者。
// 4. HITL 的准备（受信直接提交）与登记（身份门控）。两者的操作身份都由 call + wait 派生，重送认回原结果。
//    登记被原工作守卫拒绝（会话已归档、Run 已结束）时答 conflict：这是确定的拒绝，Tool 不换身份重试。
//
// inspectOperation 按待办的 action 认回原操作。ensure 的待办按同一派生重建登记命令，向 HITL 查询原登记。
// invalidate 的待办按 invalidate 用的同一派生与同一终局证据重建失效命令，向 HITL 查询原失效。
//
// 答复与恢复（HITL 协议「入口、来源与答复的解释」「恢复接收端口」）：
// - inspect 重建登记命令，按原操作认回登记的结果，再读请求。全部卡片都有决定时，决定证据是请求与全部 DecisionRef 的
//   摘要（批次就绪）；还有卡没有决定时答 null。证据只由请求与 DecisionRef 决定，所以同一批决定每次得到同一证据。
// - resolve 再读同一批决定，核对它的证据等于收到的证据，然后在 HITL 接手：以 call + wait 派生的身份绑定接收者，
//   逐卡 consumeDecision，再以接手回执 acknowledgeDelivery，卡片的交接才显示 accepted。重送认回原操作，不重复接手。之后按卡片顺序给出整批答复：至少一题有答复时为 answer，
//   跳过的卡为 no-answer；全部跳过时为 no-answer。答复值是 json-text 的 JsonValue 树。
// - invalidate 以 call + wait 派生的身份调用 HITL 的 invalidateWait：尚未答的卡失效，已答未接手的标为 superseded。
import {
  InvalidateWaitSchema,
  OperationRefSchema,
  OriginSchema,
  ReceiverGenerationSchema,
  RegisterRequestSchema,
  type CommandResult,
  type Decision,
  type InvalidateWait,
  type OperationInspection,
  type RegisterRequest,
} from '@omne-harness/human-intervention'
import {
  hitlCommandBinding,
  IndependentCommandSchema,
  type IndependentCommand,
} from '@omne-harness/human-intervention-local'
import { standingPrincipalRef } from '@omne-harness/identity'
import { judgeJsonValue, readJsonText, writeJsonText } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import { canonicalDigest } from '@omne-harness/tool'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type {
  DecisionValue,
  DurableEvidence,
  Reply,
  ToolCallId,
  ToolFailure,
  ToolOperationId,
  ToolWaitId,
} from '@omne-harness/tool-contract'
import type {
  ExternalOperationResolution,
  ToolDecisionBridge,
  ToolRecovery,
} from '@omne-harness/tool-contract/provider'
import { waitRequestOperation } from '@omne-harness/tool-host-local'
import type { SqlToolOutputBytes } from '@omne-harness/tool-storage-sql'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { HITL_DESTINATION, type TenantHitl, type ToolHitlHost } from './host.ts'
import type { HitlAudience } from './holder.ts'

/** 本组合写在证据与失败里的拥有者名。 */
export const TOOL_HITL_OWNER = '@omne-harness/harness-server/tool-hitl'
/** 决策方实现的采用名：HITL 等待的 adoptionRef 与相容实现。 */
const BRIDGE_ADOPTION = `${TOOL_HITL_OWNER}/ask/1`
const DISPLAY_CONTEXT = 'Ask'
/** 决策方在 HITL 接收者绑定里写的部署实例。它不进入卡片与原动作的身份。 */
const RECEIVER_INSTANCE = 'harness-server'
/** HITL 接收者的初始代次：等待准备时未绑定。 */
const UNBOUND_GENERATION = '0'
/** 整批答复的 JSON 文本上界：64 张卡各一份至多 8192 字符的原话，另加卡片身份与结构。 */
const ANSWER_LIMITS = {
  maxBytes: 4_194_304,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 8,
  maxStringLength: 65_536,
  maxNumberLength: 32,
}

export type ToolHitlBridgeInput = Readonly<{
  host: () => ToolHitlHost | null
  audience: () => HitlAudience | undefined
  /** 为租户签发决策方的登记主体；入口没有交来时答 undefined。 */
  registrar: (tenant: TenantId) => ActingForTenantPrincipal | undefined
  /** 受信读取保管的原件字节（tool-storage-sql 的 `readSqlToolOutputBytes`）。 */
  readOutput: (
    input: Readonly<{ tenant: TenantId; call: ToolCallId; operation: ToolOperationId }>,
  ) => Reply<SqlToolOutputBytes | null>
  /** 原调用的固定请求、等待与待办（Tool 账本的恢复读）。 */
  recoveryOf: (
    input: Readonly<{ principal: unknown; tenant: TenantId; call: ToolCallId }>,
  ) => Reply<Pick<ToolRecovery<never>, 'request' | 'waits' | 'tasks'>>
  /** 以会话工作主体读会话快照；读不到时答 undefined 或失败。 */
  readWork: (
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ) => Promise<Outcome<WorkSnapshot, Readonly<{ kind: string }>> | undefined>
}>

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: TOOL_HITL_OWNER, diagnostic })
const invalid = (field: string, reason: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'invalid', field, reason })

/**
 * HITL 原操作身份的文本：call + wait 的摘要加上步骤名。同一等待的同一步骤总得到同一身份。接手按卡分步，
 * 步骤名带卡片身份。
 */
function operationId(call: ToolCallId, wait: ToolWaitId, step: string): string {
  return `tool-wait/${canonicalDigest([call, wait]).replace(/^sha256:/, '')}/${step}`
}

/** 调用的消费者所指的 Agent 执行在会话里对应的 Run。 */
export function runOf(work: WorkSnapshot, execution: string): string | undefined {
  if (work.run.kind === 'active' && work.run.execution.execution === execution) return work.run.run
  return work.executions?.find(item => item.execution.execution === execution)?.run
}

/**
 * Ask 等待请求（tool-definitions `AskWaitRequest`）的卡片，按 HITL 的 Question 形状。保管的字节是 tool-host-local
 * `wait-request-json` codec 写的：等待请求的 `JsonValue` 树按 `JSON.stringify` 编码。这里先判成合法的树，
 * 再按 JSON 文本读出普通值。别的 codec 与不合法的树都答 undefined。
 */
function questionsOf(kept: SqlToolOutputBytes): unknown {
  if (
    kept.codec.owner !== '@omne-harness/tool-host-local' ||
    kept.codec.name !== 'wait-request-json'
  )
    return undefined
  try {
    const tree: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(kept.bytes))
    const judged = judgeJsonValue(tree)
    if (!('ok' in judged)) return undefined
    const parsed: unknown = JSON.parse(writeJsonText(judged.ok))
    return typeof parsed === 'object' && parsed !== null && 'questions' in parsed
      ? parsed.questions
      : undefined
  } catch {
    return undefined
  }
}

type Registration = Readonly<{
  at: Extract<TenantHitl, { kind: 'ready' }>['tenant']
  principal: ActingForTenantPrincipal
  prepare: Extract<IndependentCommand, { kind: 'prepare' }>
  register: RegisterRequest
}>

/** 登记的证据：HITL 登记的请求、修订与卡片。ensure 与 inspectOperation 对同一登记给出同一证据。 */
function evidenceOf(
  registered: Extract<CommandResult<'registerRequest'>, { kind: 'registered' }>,
): DurableEvidence {
  const { requestRef, revision, cards } = registered
  return {
    owner: TOOL_HITL_OWNER,
    record: `hitl-request/${requestRef.requestId}`,
    revision,
    digest: canonicalDigest({ requestRef, revision, cards }),
  }
}

type Registered = Extract<CommandResult<'registerRequest'>, { kind: 'registered' }>
/** 一张已决定的卡：卡片身份与它唯一有效的决定。 */
type Decided = Readonly<{ cardId: string; decision: Decision }>

/** Tool 等待在 HITL 的原等待引用。目的端是本发行 HITL 的固定名，代次固定为 1。 */
function toolWaitRef(wait: ToolWaitId) {
  return { owner: 'tool', waitId: wait, incarnation: '1', destination: HITL_DESTINATION } as const
}

/**
 * 批次就绪的决定证据：请求与全部 DecisionRef，按登记的卡片顺序。证据不含请求的修订，接手改变修订之后仍得到同一证据，
 * 所以 Tool 按原操作重送 acceptDecision 时认回同一输入。
 */
function batchEvidence(registered: Registered, batch: readonly Decided[]): DurableEvidence {
  const { requestRef } = registered
  return {
    owner: TOOL_HITL_OWNER,
    record: `hitl-decisions/${requestRef.requestId}`,
    revision: '1',
    digest: canonicalDigest({ requestRef, decisions: batch.map(item => item.decision.ref) }),
  }
}

/**
 * 整批答复到 Tool 的决定（HITL 协议「入口、来源与答复的解释」）：至少一题有答复时为 answer，值按卡片顺序列出每题的
 * 选中项、原话或 no-answer；全部跳过时为 no-answer。值是 json-text 的 JsonValue 树。
 */
function decisionOf(batch: readonly Decided[]): Outcome<DecisionValue, ToolFailure> {
  if (batch.every(item => item.decision.reply.kind === 'decline'))
    return succeed({ kind: 'no-answer' })
  const answers = batch.map(({ cardId, decision: { reply } }) =>
    reply.kind === 'selection'
      ? { cardId, kind: 'selection', optionId: reply.optionId }
      : reply.kind === 'text'
        ? { cardId, kind: 'text', text: reply.text }
        : { cardId, kind: 'no-answer' },
  )
  const tree = readJsonText(JSON.stringify({ answers }), ANSWER_LIMITS)
  if (tree.kind !== 'ok')
    return invalid('decision', `the answers do not form a JSON tree: ${tree.kind}`)
  return succeed({ kind: 'answer', value: tree.value })
}

type Access = Readonly<{ principal: unknown; tenant: TenantId; call: ToolCallId }>
type Recovery = Pick<ToolRecovery<never>, 'request' | 'waits' | 'tasks'>
type FindWait = (recovery: Pick<ToolRecovery<never>, 'waits' | 'tasks'>) => ToolWaitId | undefined

/** 第 1 步：等待与保管的请求原文。读回的保管证据必须等于等待的请求证据。 */
async function keptAsk(
  input: ToolHitlBridgeInput,
  access: Access,
  find: FindWait,
  request: DurableEvidence | null,
): Promise<
  Outcome<Readonly<{ fixed: Recovery; wait: ToolWaitId; questions: unknown }>, ToolFailure>
> {
  const fixed = await input.recoveryOf(access)
  if ('failure' in fixed) return fixed
  const wait = find(fixed.ok)
  const intent = fixed.ok.waits.find(record => record.intent.wait === wait)?.intent
  if (wait === undefined || intent?.kind !== 'ask')
    return invalid('wait', 'no Ask wait of the call')
  // 调用为这个等待保管的证据，必须与决策方读到的相同。
  if (request !== null && canonicalDigest(intent.request) !== canonicalDigest(request))
    return invalid('request', 'the request is not the request of the wait')
  const operation = waitRequestOperation(wait)
  if ('failure' in operation) return invalid('wait', operation.failure.reason)
  const kept = await input.readOutput({ ...access, operation: operation.ok })
  if ('failure' in kept) return kept
  if (kept.ok === null) return invalid('request', 'the wait request was never kept')
  if (canonicalDigest(kept.ok.custody) !== canonicalDigest(intent.request))
    return invalid('request', 'the kept request is not the request of the wait')
  const questions = questionsOf(kept.ok)
  if (questions === undefined) return invalid('request', 'the kept request is not an Ask request')
  return succeed({ fixed: fixed.ok, wait, questions })
}

/** 第 2 步：调用的会话，与调用的消费者所指的 Agent 执行在会话里的 Run。 */
async function sessionRun(
  input: ToolHitlBridgeInput,
  access: Access,
  execution: string,
): Promise<Outcome<Readonly<{ session: SessionId; run: string }>, ToolFailure>> {
  const work = sessionWorkOf(access.principal, access.tenant)
  if (work === undefined) return fail({ kind: 'denied', action: 'tool-decisions' })
  const session = work.session as SessionId
  const snapshot = await input.readWork({ tenant: access.tenant, session })
  if (snapshot === undefined) return unavailable('the session is not readable')
  if ('failure' in snapshot)
    return unavailable(`the session read answered ${snapshot.failure.kind}`)
  const run = runOf(snapshot.ok, execution)
  // 消费者所指的 Agent 执行不是会话的 Run 时，调用得不到 Run 的守卫：拒绝。
  if (run === undefined) return invalid('consumer', 'the call belongs to no run of its session')
  return succeed({ session, run })
}

type Commands = Readonly<{
  prepare: Extract<IndependentCommand, { kind: 'prepare' }>
  register: RegisterRequest
}>

/** 第 3、4 步：来源、受众，与 HITL 的准备和登记命令。操作身份由 call + wait 派生。 */
function commandsOf(
  facts: Readonly<{
    access: Access
    tenantText: string
    wait: ToolWaitId
    questions: unknown
    session: SessionId
    run: string
    actorRef: string
    audience: HitlAudience
  }>,
): Outcome<Commands, ToolFailure> {
  const { access, tenantText, wait, actorRef } = facts
  const operationOf = (step: 'prepare' | 'register') =>
    OperationRefSchema.safeParse({
      tenantRef: tenantText,
      actorRef,
      operationId: operationId(access.call, wait, step),
    })
  const origin = OriginSchema.safeParse({
    kind: 'tool',
    originRef: access.call,
    wait: toolWaitRef(wait),
    positionRef: wait,
    adoptionRef: BRIDGE_ADOPTION,
    toolCallRef: access.call,
    sessionRef: facts.session,
    runRef: facts.run,
  })
  if (!origin.success) return invalid('origin', 'the call does not form a HITL tool origin')
  let given: ReturnType<HitlAudience>
  try {
    given = facts.audience({ tenant: access.tenant, origin: origin.data })
  } catch {
    return unavailable('the audience of HITL cards threw')
  }
  const registerOperation = operationOf('register')
  const prepareOperation = operationOf('prepare')
  const register = RegisterRequestSchema.safeParse({
    protocol: 'hitl/1',
    operation: registerOperation.data,
    preparationRef: operationId(access.call, wait, 'prepare'),
    origin: origin.data,
    questions: facts.questions,
    displayContext: DISPLAY_CONTEXT,
  })
  if (!registerOperation.success || !prepareOperation.success || !register.success)
    return invalid('request', 'the wait does not form a HITL registration')
  const prepare = IndependentCommandSchema.safeParse({
    kind: 'prepare',
    operation: prepareOperation.data,
    preparation: {
      registration: register.data,
      readers: [...new Set([actorRef, ...given.readers])],
      responders: given.responders,
      compatibleImplementations: [BRIDGE_ADOPTION],
    },
  })
  if (!prepare.success || prepare.data.kind !== 'prepare')
    return invalid('audience', 'the audience does not form a HITL preparation')
  return succeed({ prepare: prepare.data, register: register.data })
}

type Invalidation = Readonly<{
  at: Registration['at']
  principal: ActingForTenantPrincipal
  command: InvalidateWait
}>

/** 失效的回执。invalidate 成功与 inspectOperation 认回同一失效时给出同一回执。 */
function invalidationEvidence(
  command: InvalidateWait,
  result: Readonly<{ affected: number; revision: string }>,
): DurableEvidence {
  return {
    owner: TOOL_HITL_OWNER,
    record: `hitl-invalidated/${command.operation.operationId}`,
    revision: result.revision,
    digest: canonicalDigest({ affected: result.affected, revision: result.revision }),
  }
}

/**
 * 认回的结果到 Tool 的解析。`committed` 的原结果由 `receipt` 判读，判读不出时答 unknown。只有 HITL 确认的封口
 * （not-committed）是 excluded。别的结果都答 unknown。
 */
function resolutionOf(
  operation: ToolOperationId,
  found: OperationInspection,
  sealed: string,
  receipt: (found: Extract<OperationInspection, { kind: 'committed' }>) => DurableEvidence | null,
): ExternalOperationResolution {
  switch (found.kind) {
    case 'committed': {
      const given = receipt(found)
      return given === null
        ? {
            kind: 'unknown',
            operation,
            diagnostic: `the original ${found.method} answered ${found.result.kind}`,
          }
        : { kind: 'committed', operation, receipt: given }
    }
    case 'not-committed':
      return {
        kind: 'excluded',
        operation,
        exclusion: {
          owner: TOOL_HITL_OWNER,
          record: `hitl-sealed/${sealed}`,
          revision: '1',
          digest: canonicalDigest(found.sealReceipt),
        },
      }
    default:
      return { kind: 'unknown', operation, diagnostic: `the HITL operation is ${found.kind}` }
  }
}

/** 按登记命令的原操作身份与输入摘要向 HITL 认回原登记。 */
async function recallRegistration({ at, principal, register }: Registration) {
  const binding = hitlCommandBinding('registerRequest', register)
  const found = await at.application.getOperation(principal, {
    protocol: 'hitl/1',
    operationRef: binding.operationRef,
    inputDigest: binding.inputDigest,
  })
  return { binding, found }
}

export function createToolHitlBridge(input: ToolHitlBridgeInput): ToolDecisionBridge<unknown> {
  /** 重建一个等待的完整登记。每一步都只读，不写入任何东西。 */
  const registration = async (
    access: Access,
    find: FindWait,
    request: DurableEvidence | null,
  ): Promise<Outcome<Registration, ToolFailure>> => {
    const host = input.host()
    if (host === null) return unavailable('the HITL host is not installed')
    const tenantText = tenantCodec.encode(access.tenant)
    if (!tenantText.ok) return invalid('tenant', 'not-a-tenant')
    const kept = await keptAsk(input, access, find, request)
    if ('failure' in kept) return kept
    const { fixed, wait, questions } = kept.ok
    const located = await sessionRun(input, access, fixed.request.consumer.work)
    if ('failure' in located) return located
    const principal = input.registrar(access.tenant)
    if (principal === undefined) return unavailable('the registering principal is not issued')
    const audience = input.audience()
    if (audience === undefined) return unavailable('no audience of HITL cards is installed')
    const commands = commandsOf({
      access,
      tenantText: tenantText.value,
      wait,
      questions,
      ...located.ok,
      actorRef: standingPrincipalRef(principal),
      audience,
    })
    if ('failure' in commands) return commands
    const at = await host.tenant(tenantText.value)
    if (at.kind === 'unregistered') return unavailable('the tenant has no domain')
    if (at.kind !== 'ready') return unavailable(at.diagnostic)
    return succeed({ at: at.tenant, principal, ...commands.ok })
  }

  const ensure: ToolDecisionBridge<unknown>['ensure'] = async request => {
    const built = await registration(request, () => request.wait, request.request)
    if ('failure' in built) return built
    const { at, principal, prepare, register } = built.ok
    const host = input.host()
    if (host === null) return unavailable('the HITL host is not installed')
    const prepared = await host.prepare(at, prepare)
    switch (prepared.kind) {
      case 'committed':
        break
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation: request.operation })
      case 'rolled_back':
        // 这个等待的准备已固定：同一身份下的别的输入冲突。
        return fail({ kind: 'conflict', operation: request.operation })
      default:
        return unavailable(`the HITL preparation answered ${prepared.kind}`)
    }
    const registered = await at.application.registerRequest(principal, register)
    switch (registered.kind) {
      case 'registered':
        return succeed(evidenceOf(registered))
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation: request.operation })
      case 'unavailable':
        return unavailable(`the HITL registration is unavailable: ${registered.reason}`)
      case 'conflict':
        // 守卫拒绝或操作已封口：结果确定，同一身份之后也不会落地。
        return fail({ kind: 'conflict', operation: request.operation })
      default:
        return invalid('request', `the HITL registration answered ${registered.kind}`)
    }
  }

  /** 失效命令：只由租户、登记主体、等待与终局证据决定，所以 invalidate 与认回得到同一命令。 */
  const invalidation = async (
    access: Access,
    wait: ToolWaitId,
    terminal: DurableEvidence,
  ): Promise<Outcome<Invalidation, ToolFailure>> => {
    const host = input.host()
    if (host === null) return unavailable('the HITL host is not installed')
    const tenantText = tenantCodec.encode(access.tenant)
    if (!tenantText.ok) return invalid('tenant', 'not-a-tenant')
    const principal = input.registrar(access.tenant)
    if (principal === undefined) return unavailable('the registering principal is not issued')
    const at = await host.tenant(tenantText.value)
    if (at.kind === 'unregistered') return unavailable('the tenant has no domain')
    if (at.kind !== 'ready') return unavailable(at.diagnostic)
    const command = InvalidateWaitSchema.safeParse({
      protocol: 'hitl/1',
      operation: {
        tenantRef: tenantText.value,
        actorRef: standingPrincipalRef(principal),
        operationId: operationId(access.call, wait, 'invalidate'),
      },
      waitRef: toolWaitRef(wait),
      terminalEvidenceRef: `tool-terminal/${canonicalDigest(terminal).replace(/^sha256:/, '')}`,
      // 决策方只收到终局的证据，不收到原因。
      reason: 'origin-terminal',
    })
    if (!command.success) return invalid('operation', 'the wait does not form a HITL invalidation')
    return succeed({ at: at.tenant, principal, command: command.data })
  }

  /** 原登记的认回：重建登记命令，按原操作身份查询。 */
  const recallEnsure = async (
    request: Parameters<ToolDecisionBridge<unknown>['inspectOperation']>[0],
    wait: ToolWaitId,
  ): Promise<ExternalOperationResolution> => {
    const built = await registration(request, () => wait, null)
    if ('failure' in built)
      return {
        kind: 'unknown',
        operation: request.operation,
        diagnostic: `the registration cannot be rebuilt: ${built.failure.kind}`,
      }
    const { binding, found } = await recallRegistration(built.ok)
    return resolutionOf(request.operation, found, binding.operationRef.operationId, committed =>
      committed.method === 'registerRequest' && committed.result.kind === 'registered'
        ? evidenceOf(committed.result)
        : null,
    )
  }

  /** 原失效的认回：以待办的终局证据重建失效命令，按原操作身份与输入摘要查询。 */
  const recallInvalidation = async (
    request: Parameters<ToolDecisionBridge<unknown>['inspectOperation']>[0],
    wait: ToolWaitId,
    terminal: DurableEvidence,
  ): Promise<ExternalOperationResolution> => {
    const built = await invalidation(request, wait, terminal)
    if ('failure' in built)
      return {
        kind: 'unknown',
        operation: request.operation,
        diagnostic: `the invalidation cannot be rebuilt: ${built.failure.kind}`,
      }
    const { at, principal, command } = built.ok
    const binding = hitlCommandBinding('invalidateWait', command)
    const found = await at.application.getOperation(principal, { protocol: 'hitl/1', ...binding })
    return resolutionOf(request.operation, found, binding.operationRef.operationId, committed =>
      committed.method === 'invalidateWait' && committed.result.kind === 'invalidated'
        ? invalidationEvidence(command, committed.result)
        : null,
    )
  }

  const inspectOperation: ToolDecisionBridge<unknown>['inspectOperation'] = async request => {
    // 调用的等待待办点名它的等待与种类；操作是待办自己的。
    const fixed = await input.recoveryOf(request)
    if ('failure' in fixed)
      return succeed({
        kind: 'unknown' as const,
        operation: request.operation,
        diagnostic: `the call cannot be read: ${fixed.failure.kind}`,
      })
    const task = fixed.ok.tasks.find(
      item => item.kind === 'wait-registration' && item.operation === request.operation,
    )
    if (task?.kind !== 'wait-registration')
      return succeed({
        kind: 'unknown' as const,
        operation: request.operation,
        diagnostic: 'no wait duty of the call has the operation',
      })
    return succeed(
      task.action === 'invalidate'
        ? await recallInvalidation(request, task.wait, task.evidence)
        : await recallEnsure(request, task.wait),
    )
  }

  /**
   * 原登记：重建登记命令，按原操作身份向 HITL 认回它的结果。没有成立的登记就没有可答的卡，答 unavailable，
   * 下一次唤醒再读。
   */
  const registered = async (
    access: Access,
    wait: ToolWaitId,
  ): Promise<Outcome<Registration & Readonly<{ result: Registered }>, ToolFailure>> => {
    const built = await registration(access, () => wait, null)
    if ('failure' in built) return built
    const { found } = await recallRegistration(built.ok)
    if (found.kind !== 'committed')
      return unavailable(`the registration of the wait is ${found.kind}`)
    if (found.method !== 'registerRequest' || found.result.kind !== 'registered')
      return unavailable(`the registration of the wait answered ${found.result.kind}`)
    return succeed({ ...built.ok, result: found.result })
  }

  /** 登记的卡片按登记的顺序，各带它的决定。还有卡没有决定（待答或已失效）时答 null。 */
  const decidedBatch = async (
    at: Registration['at'],
    principal: ActingForTenantPrincipal,
    result: Registered,
  ): Promise<Outcome<readonly Decided[] | null, ToolFailure>> => {
    const read = await at.application.getRequest(principal, {
      protocol: 'hitl/1',
      requestRef: result.requestRef,
    })
    if (read.kind !== 'found') return unavailable(`the HITL request read answered ${read.kind}`)
    const batch: Decided[] = []
    for (const ref of result.cards) {
      const card = read.request.cards.find(item => item.ref.cardId === ref.cardId)
      if (card === undefined) return unavailable('the HITL request lost a registered card')
      if (card.kind !== 'decided') return succeed(null)
      batch.push({ cardId: ref.cardId, decision: card.decision })
    }
    return succeed(batch)
  }

  const inspect: ToolDecisionBridge<unknown>['inspect'] = async request => {
    const original = await registered(request, request.wait)
    if ('failure' in original) return original
    const { at, principal, result } = original.ok
    const batch = await decidedBatch(at, principal, result)
    if ('failure' in batch) return batch
    return succeed({
      registration: evidenceOf(result),
      decision: batch.ok === null ? null : batchEvidence(result, batch.ok),
    })
  }

  /**
   * HITL 一侧的接手（恢复接收端口）：以派生身份绑定接收者，再逐卡 consumeDecision 并以回执 acknowledgeDelivery。
   * 重送认回原操作的回执。
   * resolve 没有自己的操作身份，所以回包未知与 HITL 的拒绝都答 unavailable：Tool 不据此接受决定，下一次唤醒按同一身份
   * 再接手。等待在 HITL 已终局（取消先成立）时也是这样，这批决定不当作答案。
   */
  const consume = async (
    built: Registration,
    access: Access,
    wait: ToolWaitId,
    batch: readonly Decided[],
  ): Promise<Outcome<null, ToolFailure>> => {
    const { at, principal, register } = built
    const operationOf = (step: string) =>
      OperationRefSchema.parse({
        ...register.operation,
        operationId: operationId(access.call, wait, step),
      })
    const waitRef = register.origin.wait
    const bound = await at.application.bindReceiver(principal, {
      protocol: 'hitl/1',
      waitRef,
      operation: operationOf('bind'),
      expectedGeneration: ReceiverGenerationSchema.parse(UNBOUND_GENERATION),
      instanceId: RECEIVER_INSTANCE,
      implementationRef: BRIDGE_ADOPTION,
    })
    if (bound.kind !== 'bound')
      return unavailable(`the HITL receiver binding answered ${bound.kind}`)
    for (const { cardId, decision } of batch) {
      const operation = operationOf(`consume/${cardId}`)
      const consumed = await at.application.consumeDecision(principal, {
        protocol: 'hitl/1',
        waitRef,
        operation,
        receiverGeneration: bound.receiverGeneration,
        decisionRef: decision.ref,
        consumeOperationId: operation.operationId,
      })
      if (consumed.kind !== 'accepted')
        return unavailable(`the HITL consumption answered ${consumed.kind}`)
      // HITL 核对过耐久回执之后，卡片才显示交接为 accepted。
      const acknowledged = await at.application.acknowledgeDelivery(principal, {
        protocol: 'hitl/1',
        operation: operationOf(`acknowledge/${cardId}`),
        consumerReceipt: consumed.receipt,
      })
      if (acknowledged.kind !== 'acknowledged')
        return unavailable(`the HITL delivery acknowledgement answered ${acknowledged.kind}`)
    }
    return succeed(null)
  }

  const resolve: ToolDecisionBridge<unknown>['resolve'] = async request => {
    const original = await registered(request, request.wait)
    if ('failure' in original) return original
    const { at, principal, result } = original.ok
    const batch = await decidedBatch(at, principal, result)
    if ('failure' in batch) return batch
    // 只有证据是 inspect 给出的那一批才是这个决定；别的批次不接手。
    if (
      batch.ok === null ||
      canonicalDigest(batchEvidence(result, batch.ok)) !== canonicalDigest(request.decision)
    )
      return invalid('decision', 'the decision is not the decided batch of the wait')
    const consumed = await consume(original.ok, request, request.wait, batch.ok)
    if ('failure' in consumed) return consumed
    return decisionOf(batch.ok)
  }

  const invalidate: ToolDecisionBridge<unknown>['invalidate'] = async request => {
    const built = await invalidation(request, request.wait, request.terminal)
    if ('failure' in built) return built
    const { at, principal, command } = built.ok
    const answer = await at.application.invalidateWait(principal, command)
    switch (answer.kind) {
      case 'invalidated':
        return succeed(invalidationEvidence(command, answer))
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation: request.operation })
      default:
        return unavailable(`the HITL invalidation answered ${answer.kind}`)
    }
  }

  return Object.freeze({ ensure, inspectOperation, inspect, invalidate, resolve })
}
