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
const ENTRY_WORK = Object.freeze({ owner: 'harness.hitl', work: 'cards' })

const UNPROVIDED: ReadonlySet<HitlOperation> = new Set<HitlOperation>()

export type HitlInstallation = Readonly<{
  faces: HitlIngressFaces<ActingForTenantPrincipal>
  locationRef: string
}>

export type HitlContext = Readonly<{
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

export function hitlProtocolRejected(messageId?: string): JsonAnswer {
  return refusal('protocol-rejected', messageId)
}

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

function isEntryPrincipal(principal: ActingForTenantPrincipal, tenant: TenantId) {
  return (
    principal.kind === 'acting-for-tenant' &&
    principal.actor.kind === 'system' &&
    principal.actor.component === COMPONENT &&
    principal.work.owner === ENTRY_WORK.owner &&
    principal.work.work === ENTRY_WORK.work &&
    tenantEquals(principal.tenant, tenant)
  )
}

async function admit(
  request: HitlRequest,
  context: HitlContext,
): Promise<ActingForTenantPrincipal | StepRefusal> {
  const caller = await context.steps.recognize(request.proof)
  if (isRefusal(caller)) return caller
  const tenant = request.body.tenant
  if (!accountEquals(tenant.account, caller.account)) return DENIED
  try {
    const issued = await context.entryPrincipals?.issue({ account: caller.account, tenant })
    if (issued?.kind === 'issued' && isEntryPrincipal(issued.principal, tenant))
      return issued.principal
  } catch {}
  emit(context.diagnostics, { code: 'issuer.fault', operation: 'hitlEntryPrincipals' })
  return UNAVAILABLE
}

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
      return { outcome: 'basis-unavailable', body: {} }
  }
}

const ORIGIN_REFS = ['sessionRef', 'runRef', 'toolCallRef'] as const

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

function commandOf(request: Submission, principal: ActingForTenantPrincipal): SubmitReply {
  const { body } = request
  const tenantText = tenantTextOf(body.tenant)
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
    return hitlAnswer(request, 'unknown', {}, context.diagnostics)
  }
  if (result.kind === 'unknown') return hitlAnswer(request, 'unknown', {}, context.diagnostics)
  const { outcome, body } = replyOutcomeOf(result)
  return hitlAnswer(request, outcome, body, context.diagnostics)
}

function inspectionOutcomeOf(
  found: OperationInspection,
): Readonly<{ outcome: PublicOutcome; body: object }> {
  switch (found.kind) {
    case 'committed':
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
