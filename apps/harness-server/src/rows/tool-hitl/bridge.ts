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
import { readJsonText } from '@omne-harness/json-text'
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
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import { HITL_DESTINATION, type TenantHitl, type ToolHitlHost } from './host.ts'
import type { HitlAudience } from './holder.ts'

export const TOOL_HITL_OWNER = '@omne-harness/harness-server/tool-hitl'
const BRIDGE_ADOPTION = `${TOOL_HITL_OWNER}/ask/1`
const DISPLAY_CONTEXT = 'Ask'
const RECEIVER_INSTANCE = 'harness-server'
const UNBOUND_GENERATION = '0'
const ANSWER_LIMITS = {
  maxBytes: 4_194_304,
  maxDepth: 8,
  maxItems: 64,
  maxMembers: 8,
  maxStringLength: 65_536,
  maxNumberLength: 32,
}

type Recovery = Pick<ToolRecovery, 'request' | 'waits' | 'waitRequest' | 'tasks'>

export type ToolHitlBridgeInput = Readonly<{
  host: () => ToolHitlHost | null
  audience: () => HitlAudience | undefined
  registrar: (tenant: TenantId) => ActingForTenantPrincipal | undefined
  recoveryOf: (
    input: Readonly<{ principal: unknown; tenant: TenantId; call: ToolCallId }>,
  ) => Reply<Recovery>
  readWork: (
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ) => Promise<Outcome<WorkSnapshot, Readonly<{ kind: string }>> | undefined>
}>

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: TOOL_HITL_OWNER, diagnostic })
const invalid = (field: string, reason: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'invalid', field, reason })

function operationId(call: ToolCallId, wait: ToolWaitId, step: string): string {
  return `tool-wait/${canonicalDigest([call, wait]).replace(/^sha256:/, '')}/${step}`
}

export function runOf(work: WorkSnapshot, execution: string): string | undefined {
  if (work.run.kind === 'active' && work.run.execution.execution === execution) return work.run.run
  return work.executions?.find(item => item.execution.execution === execution)?.run
}

function questionsOf(original: string): unknown {
  try {
    const parsed: unknown = JSON.parse(original)
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
type Decided = Readonly<{ cardId: string; decision: Decision }>

function toolWaitRef(wait: ToolWaitId) {
  return { owner: 'tool', waitId: wait, incarnation: '1', destination: HITL_DESTINATION } as const
}

function batchEvidence(registered: Registered, batch: readonly Decided[]): DurableEvidence {
  const { requestRef } = registered
  return {
    owner: TOOL_HITL_OWNER,
    record: `hitl-decisions/${requestRef.requestId}`,
    revision: '1',
    digest: canonicalDigest({ requestRef, decisions: batch.map(item => item.decision.ref) }),
  }
}

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
type FindWait = (recovery: Pick<ToolRecovery, 'waits' | 'tasks'>) => ToolWaitId | undefined

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
  if (request !== null && canonicalDigest(intent.request) !== canonicalDigest(request))
    return invalid('request', 'the request is not the request of the wait')
  const kept = fixed.ok.waitRequest
  if (kept === null || kept.wait !== wait) return invalid('request', 'the wait request is not kept')
  if (canonicalDigest(kept.request) !== intent.request.digest)
    return invalid('request', 'the kept request is not the request of the wait')
  const questions = questionsOf(kept.request)
  if (questions === undefined) return invalid('request', 'the kept request is not an Ask request')
  return succeed({ fixed: fixed.ok, wait, questions })
}

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
  if (run === undefined) return invalid('consumer', 'the call belongs to no run of its session')
  return succeed({ session, run })
}

type Commands = Readonly<{
  prepare: Extract<IndependentCommand, { kind: 'prepare' }>
  register: RegisterRequest
}>

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

type InvalidationCause = Parameters<ToolDecisionBridge<unknown>['invalidate']>[0]['cause']

type Invalidation = Readonly<{
  at: Registration['at']
  principal: ActingForTenantPrincipal
  command: InvalidateWait
}>

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
        return fail({ kind: 'conflict', operation: request.operation })
      default:
        return invalid('request', `the HITL registration answered ${registered.kind}`)
    }
  }

  const invalidation = async (
    access: Access,
    wait: ToolWaitId,
    terminal: DurableEvidence,
    cause: InvalidationCause,
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
      reason: cause === 'cancelled' ? 'cancelled' : 'origin-terminal',
    })
    if (!command.success) return invalid('operation', 'the wait does not form a HITL invalidation')
    return succeed({ at: at.tenant, principal, command: command.data })
  }

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

  const recallInvalidation = async (
    request: Parameters<ToolDecisionBridge<unknown>['inspectOperation']>[0],
    wait: ToolWaitId,
    terminal: DurableEvidence,
    cause: InvalidationCause,
  ): Promise<ExternalOperationResolution> => {
    const built = await invalidation(request, wait, terminal, cause)
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
    if (task.action !== 'invalidate') return succeed(await recallEnsure(request, task.wait))
    const closed = fixed.ok.waits.find(record => record.intent.wait === task.wait)
    if (closed?.phase !== 'closed' || closed.cause === 'continued')
      return succeed({
        kind: 'unknown' as const,
        operation: request.operation,
        diagnostic: 'the wait of the invalidation is not closed by a control or a terminal',
      })
    return succeed(await recallInvalidation(request, task.wait, task.evidence, closed.cause))
  }

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
    const built = await invalidation(request, request.wait, request.terminal, request.cause)
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
