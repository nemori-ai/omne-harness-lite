// HITL 位置（SPEC「HITL 位置」）：公开契约「HITL 判断次序」的四步。协议读取，登录识别，目标租户
// 的账号等于识别出的账号后由装配给的持有者签发入口主体，再以入口主体调用 HITL 入口面。接入不另核
// 资格，HITL 的拒绝原样成为 `denied`，所以各个原因的 `denied` 除 `messageId` 外逐字节相同。
import type {
  CommandResult,
  GetCard,
  GetOperation,
  HitlConflict,
  HitlReadFailure,
  ListPool,
  OperationInspection,
  PoolItem,
  SubmitReply,
} from '@omne-harness/human-intervention'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import type { JsonLimits } from '@omne-harness/json-text'
import { accountEquals, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import {
  encodeHitlResponse,
  readHitlRequest,
  type HitlCard,
  type HitlCardItem,
  type HitlCardOrigin,
  type HitlOperation,
  type HitlRequest,
  type HitlResponseEncodeInput,
} from '@omne-harness/public-contract'
import type { JsonAnswer, NoAnswer } from './answers.ts'
import { OUTPUT_LIMITS } from './config.ts'
import { hitlReplyIdentity, tenantTextOf } from './derivation.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import type { HitlEntryPrincipals, HitlIngressFaces } from './faces.ts'
import {
  COMPONENT,
  DENIED,
  UNAVAILABLE,
  isRefusal,
  type IdentitySteps,
  type StepRefusal,
} from './identity-steps.ts'
import { STATUS_BY_OUTCOME, type PublicOutcome } from './status.ts'

export const HITL_PATH = '/hitl-public/1'
const VERSION = 'hitl-public/1'
const PROTOCOL = 'hitl/1'
/** 入口主体的原工作。固定文本，所以同一租户每次签发都得到同一个主体引用。 */
const ENTRY_WORK = Object.freeze({ owner: 'harness.hitl', work: 'cards' })

/**
 * 本部署声明不提供的 HITL 操作（SPEC「HITL 位置」的补充规则）。四个操作都已实现，所以它是空的；
 * 机制留着，部署要收回某个操作时把它加在这里。
 */
const UNPROVIDED: ReadonlySet<HitlOperation> = new Set<HitlOperation>()

/** 装配给的 HITL 入口面，以及交给 `listPool` 的位置引用。两者一起出现。 */
export type HitlInstallation = Readonly<{
  faces: HitlIngressFaces<ActingForTenantPrincipal>
  locationRef: string
}>

export type HitlContext = Readonly<{
  /** 缺席时四个操作都答 `stage-not-provided`。 */
  installation: HitlInstallation | undefined
  entryPrincipals: HitlEntryPrincipals | undefined
  steps: IdentitySteps
  readLimits: JsonLimits
  diagnostics: DiagnosticSink | undefined
}>

type Reply = JsonAnswer | NoAnswer
type Refusal = 'protocol-rejected' | 'stage-not-provided'

function refusal(outcome: Refusal, messageId?: string): JsonAnswer {
  const result = encodeHitlResponse({
    response: {
      protocolVersion: VERSION,
      ...(messageId === undefined ? {} : { messageId }),
      outcome,
      body: {},
    },
    limits: OUTPUT_LIMITS,
  })
  if (result.kind !== 'encoded') throw new TypeError('server-entry: a hitl refusal did not encode')
  return { kind: 'json', status: STATUS_BY_OUTCOME[outcome], bytes: result.bytes }
}

/** 本位置的 `protocol-rejected`。只有读取找到可信的 `messageId` 时才带上它。 */
export function hitlProtocolRejected(messageId?: string): JsonAnswer {
  return refusal('protocol-rejected', messageId)
}

/** 编码一份业务响应。公开契约的编码函数按操作核对 outcome 与正文；编码失败是接入自身的故障。 */
function hitlAnswer(
  request: HitlRequest,
  outcome: PublicOutcome,
  body: unknown,
  diagnostics: DiagnosticSink | undefined,
): Reply {
  const input = {
    operation: request.operation,
    response: { protocolVersion: VERSION, messageId: request.messageId, outcome, body },
    limits: OUTPUT_LIMITS,
  } as unknown as HitlResponseEncodeInput
  const result = encodeHitlResponse(input)
  if (result.kind !== 'encoded') {
    emit(diagnostics, { code: 'encode.fault', operation: request.operation })
    return { kind: 'no-answer' }
  }
  return { kind: 'json', status: STATUS_BY_OUTCOME[outcome], bytes: result.bytes }
}

/** 持有者给出的主体必须是这个租户的入口主体，否则不能拿它调用 HITL。 */
function isEntryPrincipal(principal: ActingForTenantPrincipal | undefined, tenant: TenantId) {
  return (
    principal?.kind === 'acting-for-tenant' &&
    principal.actor?.kind === 'system' &&
    principal.actor.component === COMPONENT &&
    principal.work?.owner === ENTRY_WORK.owner &&
    principal.work.work === ENTRY_WORK.work &&
    tenantEquals(principal.tenant, tenant)
  )
}

/** 第 2、3 步：识别登录，核对目标租户的账号，再由持有者签发入口主体。 */
async function admit(
  request: HitlRequest,
  context: HitlContext,
): Promise<ActingForTenantPrincipal | StepRefusal> {
  const caller = await context.steps.recognize(request.proof)
  if (isRefusal(caller)) return caller
  const tenant = request.body.tenant
  if (!accountEquals(tenant.account, caller.account)) return DENIED
  try {
    // 只交出账号与目标租户，不交出登录：入口主体与这次用哪一份登录无关。
    const issued = await context.entryPrincipals?.issue({ account: caller.account, tenant })
    if (issued?.kind === 'issued' && isEntryPrincipal(issued.principal, tenant))
      return issued.principal
  } catch {
    // 持有者抛出，与持有者缺席、拒绝签发同样处理。
  }
  emit(context.diagnostics, { code: 'issuer.fault', operation: 'hitlEntryPrincipals' })
  return UNAVAILABLE
}

/** HITL 的读取失败到公开结果（公开契约「HITL 结果」表后的映射规则）。 */
function failureOf(
  failure: HitlReadFailure | HitlConflict,
): Readonly<{ outcome: PublicOutcome; body: object }> {
  switch (failure.kind) {
    case 'denied':
      return { outcome: 'denied', body: {} }
    case 'invalid-input':
      return { outcome: 'invalid', body: {} }
    case 'limited':
      return { outcome: 'limited', body: { resource: failure.resource, limit: failure.limit } }
    case 'conflict':
      return { outcome: 'conflict', body: {} }
    default:
      // `unavailable`，或提供者给出表外的种类：现在不能得出允许。
      return { outcome: 'basis-unavailable', body: {} }
  }
}

const ORIGIN_REFS = ['sessionRef', 'runRef', 'toolCallRef'] as const

/** 池项到卡片视图：`origin` 只取来源种类与三个引用，原等待的路由字段不进入视图。 */
function viewOf(item: PoolItem): HitlCardItem {
  const source: Readonly<{ [K in (typeof ORIGIN_REFS)[number]]?: string | undefined }> = item.origin
  const origin: { -readonly [K in keyof HitlCardOrigin]: HitlCardOrigin[K] } = {
    kind: item.origin.kind,
  }
  for (const key of ORIGIN_REFS) {
    const value = source[key]
    if (value !== undefined) origin[key] = value
  }
  return { card: item.card as HitlCard, origin, displayContext: item.displayContext }
}

async function listCards(
  request: HitlRequest<'list-cards'>,
  principal: ActingForTenantPrincipal,
  installation: HitlInstallation,
  context: HitlContext,
): Promise<Reply> {
  const { body } = request
  // 形状与长度预算由 HITL 自己按它的模式核对，超出时 HITL 答 `invalid-input`。
  const query = {
    protocol: PROTOCOL,
    tenantRef: tenantTextOf(body.tenant),
    locationRef: installation.locationRef,
    filter: body.filter,
    limit: body.limit,
    ...(body.cursor === null ? {} : { cursor: body.cursor }),
  } as unknown as ListPool
  let result
  try {
    result = await installation.faces.queries.listPool(principal, query)
  } catch {
    emit(context.diagnostics, { code: 'hitl.read-fault', operation: 'listPool' })
    return hitlAnswer(request, 'basis-unavailable', {}, context.diagnostics)
  }
  if (result.kind !== 'page') {
    const { outcome, body: failureBody } = failureOf(result)
    return hitlAnswer(request, outcome, failureBody, context.diagnostics)
  }
  return hitlAnswer(
    request,
    'succeeded',
    {
      items: result.items.map(viewOf),
      next: result.next,
      snapshotRef: result.snapshotRef,
      completeness: result.completeness,
    },
    context.diagnostics,
  )
}

async function readCard(
  request: HitlRequest<'read-card'>,
  principal: ActingForTenantPrincipal,
  installation: HitlInstallation,
  context: HitlContext,
): Promise<Reply> {
  const query = { protocol: PROTOCOL, cardRef: request.body.card } as unknown as GetCard
  let result
  try {
    result = await installation.faces.queries.getCard(principal, query)
  } catch {
    emit(context.diagnostics, { code: 'hitl.read-fault', operation: 'getCard' })
    return hitlAnswer(request, 'basis-unavailable', {}, context.diagnostics)
  }
  if (result.kind !== 'found') {
    const { outcome, body } = failureOf(result)
    return hitlAnswer(request, outcome, body, context.diagnostics)
  }
  return hitlAnswer(request, 'succeeded', { item: viewOf(result.item) }, context.diagnostics)
}

type Submission = HitlRequest<'submit-reply' | 'query-submit-reply'>
type SubmitResult = Exclude<CommandResult<'submitReply'>, { kind: 'unknown' }>

/**
 * 一次提交的 HITL 命令（SPEC「HITL 提交身份的派生规则」）：提交身份由目标租户与 `replyId` 派生，操作者是入口主体的
 * `standingPrincipalRef`。`submit-reply` 与 `query-submit-reply` 用同一个派生，所以认回的是同一条命令。
 */
function commandOf(request: Submission, principal: ActingForTenantPrincipal): SubmitReply {
  const { body } = request
  const tenantText = tenantTextOf(body.tenant)
  // 形状与长度预算由 HITL 自己按它的模式核对，超出时 HITL 答 `invalid-input` 或 `limited`。
  return {
    protocol: PROTOCOL,
    operation: {
      tenantRef: tenantText,
      actorRef: standingPrincipalRef(principal),
      operationId: hitlReplyIdentity(tenantText, body.replyId),
    },
    cardRef: body.card,
    expectedRevision: body.expectedRevision,
    reply: body.reply,
  } as unknown as SubmitReply
}

/** 答复命令的结果到公开结果：三种成功都是 `succeeded`，以 `kind` 区分；失败按映射规则。 */
function replyOutcomeOf(result: SubmitResult): Readonly<{ outcome: PublicOutcome; body: object }> {
  switch (result.kind) {
    case 'decided':
      return {
        outcome: 'succeeded',
        body: {
          kind: 'decided',
          decisionRef: result.decisionRef,
          revision: result.revision,
          delivery: result.delivery,
        },
      }
    case 'already-decided':
      return { outcome: 'succeeded', body: { kind: 'already-decided', decision: result.decision } }
    case 'invalidated':
      return { outcome: 'succeeded', body: { kind: 'invalidated', reason: result.reason } }
    default:
      return failureOf(result)
  }
}

async function submitReply(
  request: HitlRequest<'submit-reply'>,
  principal: ActingForTenantPrincipal,
  installation: HitlInstallation,
  context: HitlContext,
): Promise<Reply> {
  let result
  try {
    result = await installation.faces.commands.submitReply(principal, commandOf(request, principal))
  } catch {
    // 调用已经开始，提交可能已经成立：调用者用同一 `replyId` 原样再送，或用 `query-submit-reply` 认回。
    return hitlAnswer(request, 'unknown', {}, context.diagnostics)
  }
  if (result.kind === 'unknown') return hitlAnswer(request, 'unknown', {}, context.diagnostics)
  const { outcome, body } = replyOutcomeOf(result)
  return hitlAnswer(request, outcome, body, context.diagnostics)
}

/** 原操作查询的结果到公开结果（公开契约「HITL 结果」表的 `query-submit-reply` 行）。 */
function inspectionOutcomeOf(
  found: OperationInspection,
): Readonly<{ outcome: PublicOutcome; body: object }> {
  switch (found.kind) {
    case 'committed':
      // 同一提交身份只属于答复命令。别的方法占着这个身份时，同一身份对应了不同内容。
      return found.method === 'submitReply'
        ? replyOutcomeOf(found.result as SubmitResult)
        : { outcome: 'conflict', body: {} }
    case 'not-committed':
      return { outcome: 'not-committed', body: {} }
    case 'unknown':
      return { outcome: 'unknown', body: {} }
    default:
      return failureOf(found)
  }
}

async function querySubmitReply(
  request: HitlRequest<'query-submit-reply'>,
  principal: ActingForTenantPrincipal,
  installation: HitlInstallation,
  context: HitlContext,
): Promise<Reply> {
  let found
  try {
    // 摘要由 HITL 提供者给出，接入不另写摘要算法。
    const binding = installation.faces.bindSubmitReply(commandOf(request, principal))
    found = await installation.faces.queries.getOperation(principal, {
      protocol: PROTOCOL,
      operationRef: binding.operationRef,
      inputDigest: binding.inputDigest,
    } as unknown as GetOperation)
  } catch {
    emit(context.diagnostics, { code: 'hitl.read-fault', operation: 'getOperation' })
    return hitlAnswer(request, 'basis-unavailable', {}, context.diagnostics)
  }
  const { outcome, body } = inspectionOutcomeOf(found)
  return hitlAnswer(request, outcome, body, context.diagnostics)
}

export async function handleHitl(bytes: Uint8Array, context: HitlContext): Promise<Reply> {
  const read = readHitlRequest({ bytes, limits: context.readLimits })
  if (read.kind !== 'request') return hitlProtocolRejected(read.response.messageId)
  const { request } = read
  const { installation } = context
  // 部署声明不提供的操作在第 1 步之后立刻作答，不识别登录，也不调用 HITL。
  if (installation === undefined || UNPROVIDED.has(request.operation))
    return refusal('stage-not-provided', request.messageId)
  const principal = await admit(request, context)
  if (isRefusal(principal)) return hitlAnswer(request, principal.outcome, {}, context.diagnostics)
  switch (request.operation) {
    case 'list-cards':
      return listCards(request, principal, installation, context)
    case 'read-card':
      return readCard(request, principal, installation, context)
    case 'submit-reply':
      return submitReply(request, principal, installation, context)
    case 'query-submit-reply':
      return querySubmitReply(request, principal, installation, context)
  }
}
