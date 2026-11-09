// J06, the message admission provider of the Session log combination (row `session-handoff`). It
// provides `agentMessageHandoff` and keeps each admission in the preadmission records of the
// `execution-record` participant (C-STORAGE): the intent first, the outcome once, both durable
// before the answer.
//
// `prepare` follows the six steps of Agent SPEC "消息准入":
// 1. the shape (`judgeHandoffPrepare`), the tenant and the qualification of the caller. The binding
//    of each branch comes from trusted facts, never from the input: the execution branch and the
//    submit branch route their execution through the execution index of the tenant; the invoke
//    branch decodes its runtime scope as the session slot scope that AD-14 gives the instance
//    (`sessionScopeEvidence`, whose digest only checks consistency), and the Session snapshot of that
//    session must hold the execution in its active Run. The invoke and submit branches ask
//    `agentAccessCheck` with their operation names; the execution branch is the runtime's call
//    inside an operation already checked and is not checked again;
// 2. the stable identity and the complete original request: an internal H must be the P that the
//    Journal of the same session saved; an external request is found by its entry index Ki. A held
//    record with another request is a conflict; a fixed outcome is recalled before anything else;
// 3. the execution branch then checks that the advance is the current one (`stale-advance`);
// 4. a first call saves the intent (Ki, H, the request, the origin, the stable principal identity,
//    the qualification basis and the adopted implementation) and goes on only when it is durable;
// 5. this wave has no representation conversion;
// 6. the outcome is fixed once: `prepared` with the original candidate, or `rejected` when the
//    candidate fails the message check; then the answer.
//
// `lookup` reads a record and starts nothing. `exclude` is not offered in this wave: it answers
// `unsupported`.
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import {
  judgeAdoption,
  judgeEvidence,
  judgeHandoffPrepare,
  type Access,
  type Adoption,
  type AgentAccessOperation,
  type AgentAccessTarget,
  type AgentExecutionId,
  type DurableEvidence,
  type Failure,
  type HandoffDecision,
  type HandoffLookup,
  type HandoffOutcome,
  type HandoffPrepare,
  type HandoffRequest,
  type HandoffResolution,
  type InputOrigin,
  type MessageHandoff,
  type Reply,
} from '@omne-harness/agent-contract'
import {
  MessageHandoffService,
  agentAccessCheckKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import { sessionKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_EXECUTION_HANDLER,
  SESSION_PROTOCOL,
  decodePreadmissionRecord,
  decodePreadmissionReply,
  decodeSessionExecution,
  preadmissionFacts,
  type PreadmissionRecord,
} from '@omne-harness/session-storage-sql/participants'
import type {
  DomainRef,
  JsonValue,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import {
  commitJournal,
  refusalFailure,
  type GenerationMemory,
  type JournalCombination,
} from '../journal-commit.ts'
import { canonical } from '../testing/canonical.ts'
import { type SessionCoordinatorPrincipalFailure, sessionScopeEvidence } from './agent-drive.ts'
import { readExecutionRecords } from './agent-journal.ts'
import { attemptOfAuthority, type GrantedAttachment } from './attempt-grant.ts'
import { decodeState, encodeState } from './durable-codec.ts'

const OWNER = 'session-adapters/message-handoff'
const LOGGER = 'session-adapters/message-handoff'

/** What the assembly hands to the provider. */
export type SessionMessageHandoffInput<P> = Readonly<{
  /** The principal the assembly issues to the coordinator of one session, as for AD-02 and AD-14. */
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
  /** The stable identity of a caller that the record keeps; never a credential. */
  principalIdentity(principal: P): string
  /** The adopted implementation of this provider, which every outcome names. */
  provider: Adoption
}>

/** The plugin configuration: the declared Session log combination its records commit under. */
export type MessageHandoffConfig = JournalCombination

type Ports<P> = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  readWork(
    access: Readonly<{ principal: P; tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<WorkSnapshot, unknown>>
  check(
    access: Access<P>,
    operation: AgentAccessOperation,
    target: AgentAccessTarget,
  ): Promise<Outcome<DurableEvidence, Failure>>
  combination: JournalCombination
  stopped(): boolean
}>

/** The trusted binding of one prepare: where it belongs, its origin and its qualification basis. */
type Binding = Readonly<{
  bound: Bound
  origin: InputOrigin | null
  basis: DurableEvidence | null
}>

/** Where one request belongs: its session and the identities its record is keyed by. */
type Bound = Readonly<{
  tenant: TenantId
  tenantText: string
  session: SessionId
  execution: AgentExecutionId
  /** H: the handoff identity text. */
  handoff: string
  /** Ki: the entry index text of an external request; null for an internal H. */
  entry: string | null
}>

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})
const denied = (action: string): Failure => ({ kind: 'denied', action })

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** The H of a request: the canonical text of its reference. */
const handoffOf = (request: HandoffRequest): string => canonical(request.reference)

/** The Ki of an external request: its execution and its original entry operation. */
const entryOf = (execution: string, operation: string): string => canonical([execution, operation])

/** The evidence of one saved record: it names the tenant, H and the saved intent. */
function recordEvidence(record: PreadmissionRecord): DurableEvidence {
  return {
    owner: OWNER,
    record: `${record.tenant}/${record.handoff}`,
    revision: '1',
    digest: record.intentDigest,
  }
}

/** The candidate message of a request: the P candidate, or the accepted content of the entry. */
function candidateOf(request: HandoffRequest): Message {
  if (request.kind === 'execution') return request.candidate
  return request.entry.kind === 'invoke'
    ? request.entry.initial.content
    : request.entry.value.content
}

function decodeIntent(record: PreadmissionRecord) {
  const intent = record.intent as Readonly<Record<string, JsonValue>>
  return {
    request: decodeState(intent['request'] ?? null) as HandoffRequest,
    origin: decodeState(intent['origin'] ?? null) as InputOrigin | null,
    qualification: decodeState(intent['qualification'] ?? null) as DurableEvidence,
  }
}

function decodeOutcome(record: PreadmissionRecord): HandoffOutcome | null {
  if (record.outcome === null) return null
  const saved = outcomeMembers(decodeState(record.outcome))
  const legacy = !('format' in saved)
  if (!legacy && saved['format'] !== 'intent-relative-v1')
    throw new TypeError('the preadmission outcome format is not supported')
  const value = legacy ? outcomeMembers(saved['outcome']) : saved
  const provider = judgeAdoption(value['provider'])
  if ('failure' in provider) throw new TypeError('the preadmission provider is malformed')
  const original = decodeIntent(record)
  const evidence = recordEvidence(record)
  const decision = restoreDecision(value['decision'], original.request, legacy)
  if (saved['kind'] !== decision.kind)
    throw new TypeError('the preadmission outcome kind does not match its decision')
  if (
    legacy &&
    (canonical(value['request']) !== canonical(original.request) ||
      canonical(value['origin']) !== canonical(original.origin) ||
      canonical(value['qualification']) !== canonical(original.qualification) ||
      canonical(value['record']) !== canonical(evidence))
  )
    throw new TypeError('the preadmission outcome does not match its intent')
  return { ...original, provider: provider.ok, record: evidence, decision }
}

type StoredDecision =
  | Omit<Extract<HandoffDecision, { kind: 'prepared' }>, 'message'>
  | Extract<HandoffDecision, { kind: 'rejected' }>

function outcomeMembers(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('the preadmission outcome is malformed')
  return value as Readonly<Record<string, unknown>>
}

function restoreDecision(
  value: unknown,
  request: HandoffRequest,
  legacy: boolean,
): HandoffDecision {
  const decision = outcomeMembers(value)
  switch (decision['kind']) {
    case 'prepared': {
      const admission = judgeEvidence(decision['admission'])
      const message = candidateOf(request)
      if (
        'failure' in admission ||
        (legacy ? canonical(decision['message']) !== canonical(message) : 'message' in decision)
      )
        throw new TypeError('the prepared preadmission outcome is malformed')
      return { kind: 'prepared', message, admission: admission.ok }
    }
    case 'rejected': {
      const evidence = judgeEvidence(decision['evidence'])
      const reason = decision['reason']
      if ('failure' in evidence || typeof reason !== 'string')
        throw new TypeError('the rejected preadmission outcome is malformed')
      return { kind: 'rejected', reason, evidence: evidence.ok }
    }
    default:
      throw new TypeError('the preadmission decision is malformed')
  }
}

/** The provider of one generation. */
function createMessageHandoff<P>(
  given: SessionMessageHandoffInput<P>,
  ports: Ports<P>,
): MessageHandoff<P> {
  const generations: GenerationMemory = new Map()

  async function domainOf(tenantText: string): Promise<Outcome<DomainRef, Failure>> {
    const found = await ports.tenantDomainLookup.lookup({ tenant: tenantText })
    return found.kind === 'ready'
      ? succeed(found.domain)
      : fail(
          unavailable(
            found.kind === 'unregistered'
              ? 'the tenant has no transaction domain'
              : found.diagnostic,
          ),
        )
  }

  async function read(domain: DomainRef, handler: string, protocol: string, input: JsonValue) {
    const result = await ports.storage.read({
      domain,
      handler,
      protocol,
      requestKey: randomUUID(),
      input,
    })
    return result.kind === 'read' ? { output: result.output } : null
  }

  /** The session that started `execution` for the tenant, by the execution index. */
  async function sessionOfExecution(
    tenantText: string,
    domain: DomainRef,
    execution: string,
    action: string,
  ): Promise<Outcome<SessionId, Failure>> {
    const found = await read(domain, SESSION_EXECUTION_HANDLER, SESSION_PROTOCOL, {
      tenant: tenantText,
      execution,
    })
    if (found === null) return fail(unavailable('the execution index is not readable'))
    const indexed = decodeSessionExecution(found.output)
    if (indexed === 'malformed') return fail(unavailable('the execution index row is malformed'))
    return indexed === null ? fail(denied(action)) : succeed(indexed.session as SessionId)
  }

  /** The Session snapshot of the bound session, read as its coordinator. */
  async function snapshotOf(
    tenant: TenantId,
    session: SessionId,
  ): Promise<Outcome<WorkSnapshot, Failure>> {
    const principal = await given.coordinator({ tenant, session })
    if ('failure' in principal) return fail(unavailable('no coordinator principal for the session'))
    const work = await ports.readWork({ principal: principal.ok, tenant, session })
    return 'ok' in work
      ? succeed(work.ok)
      : fail(unavailable('the Session snapshot is not readable'))
  }

  /** The active Run of the snapshot must hold `execution`. */
  const runHolds = (work: WorkSnapshot, execution: string): boolean =>
    work.run.kind === 'active' && work.run.execution.execution === execution

  /** The session the Run of `execution` is active in, after `check` allowed the call. */
  async function qualified(
    access: Access<P>,
    session: SessionId,
    execution: string,
    action: 'invoke' | 'submit',
    target: AgentAccessTarget,
  ): Promise<Outcome<DurableEvidence, Failure>> {
    const work = await snapshotOf(access.tenant, session)
    if ('failure' in work) return work
    if (!runHolds(work.ok, execution)) return fail(denied(action))
    return ports.check(access, action, target)
  }

  /**
   * The invoke branch: the runtime scope is the slot scope of a session (AD-14). Its record names
   * the session. The digest is a consistency check only: it has no key, so anyone can compute it
   * for a tenant and a session and it is not a guard. Another tenant's session is kept out by the
   * tenant domain lookup and the Session execution boundary.
   */
  async function bindInvoke(
    access: Access<P>,
    tenantText: string,
    prepare: Extract<HandoffPrepare, { kind: 'invoke' }>,
  ): Promise<Outcome<Binding, Failure>> {
    const { scope, instance, definition, grant } = prepare.runtime
    const reference = prepare.request.reference
    const session = scope.record as SessionId
    if (canonical(sessionScopeEvidence(tenantText, session)) !== canonical(scope))
      return fail(denied('invoke'))
    const allowed = await qualified(access, session, reference.execution, 'invoke', {
      kind: 'scope',
      scope,
      definition,
    })
    if ('failure' in allowed) return allowed
    return succeed({
      bound: {
        tenant: access.tenant,
        tenantText,
        session,
        execution: reference.execution,
        handoff: handoffOf(prepare.request),
        entry: entryOf(reference.execution, reference.entry),
      },
      origin: { kind: 'invoke', instance, scope, definition, grant },
      basis: allowed.ok,
    })
  }

  /** The submit branch: the original execution by the execution index of the tenant. */
  async function bindSubmit(
    access: Access<P>,
    tenantText: string,
    domain: DomainRef,
    prepare: Extract<HandoffPrepare, { kind: 'submit' }>,
  ): Promise<Outcome<Binding, Failure>> {
    const reference = prepare.request.reference
    const execution = reference.execution
    const session = await sessionOfExecution(tenantText, domain, execution, 'submit')
    if ('failure' in session) return session
    const allowed = await qualified(access, session.ok, execution, 'submit', {
      kind: 'execution',
      execution,
    })
    if ('failure' in allowed) return allowed
    return succeed({
      bound: {
        tenant: access.tenant,
        tenantText,
        session: session.ok,
        execution,
        handoff: handoffOf(prepare.request),
        entry: entryOf(execution, reference.entry),
      },
      origin: {
        kind: 'submit',
        executionBinding: {
          owner: OWNER,
          record: `${tenantText}/${execution}`,
          revision: '1',
          digest: sha256(canonical([tenantText, session.ok, execution])),
        },
        delivery: { kind: 'durable-view' },
      },
      basis: allowed.ok,
    })
  }

  /** Step 1: the trusted binding of each branch, and the qualification of an external call. */
  async function bind(
    access: Access<P>,
    tenantText: string,
    prepare: HandoffPrepare,
  ): Promise<Outcome<Binding, Failure>> {
    const domain = await domainOf(tenantText)
    if ('failure' in domain) return domain
    if (prepare.kind === 'invoke') return bindInvoke(access, tenantText, prepare)
    if (prepare.kind === 'submit') return bindSubmit(access, tenantText, domain.ok, prepare)
    const execution = prepare.request.reference.execution
    const session = await sessionOfExecution(tenantText, domain.ok, execution, 'prepare')
    if ('failure' in session) return session
    return succeed({
      bound: {
        tenant: access.tenant,
        tenantText,
        session: session.ok,
        execution,
        handoff: handoffOf(prepare.request),
        entry: null,
      },
      origin: null,
      basis: null,
    })
  }

  /** Steps 2 and 3 of the execution branch: the P of the same session and the current advance. */
  async function internal(bound: Bound, prepare: Extract<HandoffPrepare, { kind: 'execution' }>) {
    // The execution's records and its attachments, folded from the facts of the execution.
    const records = await readExecutionRecords(ports, bound)
    if (records.kind === 'unavailable') return fail(unavailable(records.diagnostic))
    const execution = records.execution
    if (execution === null) return fail(denied('prepare'))
    const saved = execution.handoffs.find(
      item => canonical(item.handoff) === canonical(prepare.request.reference),
    )
    if (saved === undefined || canonical(saved.request) !== canonical(prepare.request))
      return fail<Failure>({
        kind: 'invalid',
        field: 'request',
        reason: 'not the P the Journal saved',
      })
    return succeed(execution.attachments)
  }

  /**
   * The advance must be the current attempt: the attempt the Session issued the grant of the
   * Authority's attachment for (R2-D348, R2-D349). A snapshot without its attempt records proves
   * nothing, so the advance is stale.
   */
  async function advances(
    bound: Bound,
    attachments: readonly GrantedAttachment[],
    prepare: Extract<HandoffPrepare, { kind: 'execution' }>,
  ): Promise<Outcome<null, Failure>> {
    const work = await snapshotOf(bound.tenant, bound.session)
    if ('failure' in work) return work
    const run = work.ok.run
    const attempt = attemptOfAuthority(attachments, work.ok.historyIndex?.attempts, prepare.advance)
    return run.kind === 'active' &&
      run.execution.execution === bound.execution &&
      run.advance !== null &&
      attempt?.attempt === run.advance.attempt
      ? succeed(null)
      : fail({ kind: 'stale-advance' })
  }

  /** One read of the preadmission records, by H or by Ki. */
  async function recordOf(bound: Bound): Promise<Outcome<PreadmissionRecord | null, Failure>> {
    const domain = await domainOf(bound.tenantText)
    if ('failure' in domain) return domain
    const input =
      bound.entry === null
        ? { tenant: bound.tenantText, handoff: bound.handoff }
        : { tenant: bound.tenantText, entry: bound.entry }
    const found = await read(
      domain.ok,
      EXECUTION_RECORD_HANDLERS.preadmission,
      EXECUTION_RECORD_PROTOCOL,
      input,
    )
    if (found === null) return fail(unavailable('the preadmission records are not readable'))
    const record = decodePreadmissionRecord(found.output)
    return record === 'malformed'
      ? fail(unavailable('a preadmission record is malformed'))
      : succeed(record)
  }

  /** One write of the preadmission records; it answers only after the storage committed it. */
  async function write(
    bound: Bound,
    facts: Parameters<typeof preadmissionFacts>[0],
  ): Promise<Outcome<PreadmissionRecord, Failure>> {
    if (ports.stopped()) return fail(unavailable('the message handoff provider has stopped'))
    const domain = await domainOf(bound.tenantText)
    if ('failure' in domain) return domain
    const command = preadmissionFacts(facts)
    const outcome = await commitJournal({
      storage: ports.storage,
      domain: domain.ok,
      combination: ports.combination,
      operation: `pre_${sha256(canonical([bound.tenantText, bound.handoff, command.facts]))}`,
      commands: [command],
      generations,
    })
    if (outcome.kind === 'refused') return fail(refusalFailure(outcome.reason))
    if (outcome.kind === 'unknown' || outcome.kind === 'unavailable')
      return fail(unavailable(`the preadmission write is ${outcome.kind}: ${outcome.diagnostic}`))
    const reply = outcome.receipt.responses.find(item => item.participant === 'execution-record')
    if (reply === undefined) return fail(unavailable('a preadmission receipt without its reply'))
    const decoded = decodePreadmissionReply(reply.reply)
    switch (decoded.kind) {
      case 'saved':
        return succeed(decoded.record)
      case 'conflict':
        return fail({ kind: 'conflict', operation: bound.handoff as never })
      case 'invalid':
        return fail({ kind: 'invalid', field: 'handoff', reason: decoded.reason })
      default:
        return fail(unavailable(`the preadmission write failed: ${JSON.stringify(decoded)}`))
    }
  }

  /** Step 6: the decision for the original candidate; only a failed message check rejects. */
  function decide(request: HandoffRequest, basis: DurableEvidence): HandoffDecision {
    const judged = judgeMessage(candidateOf(request))
    return 'ok' in judged
      ? { kind: 'prepared', message: candidateOf(request), admission: basis }
      : {
          kind: 'rejected',
          reason: `the candidate message is not valid: ${judged.rejected}`,
          evidence: basis,
        }
  }

  /** Step 2: a held record answers by its own request; null when it holds no fixed outcome yet. */
  function recall(
    record: PreadmissionRecord,
    request: HandoffRequest,
  ): Outcome<HandoffOutcome | null, Failure> {
    if (canonical(decodeIntent(record).request) !== canonical(request))
      return fail({
        kind: 'conflict',
        operation:
          request.reference.kind === 'execution'
            ? request.reference.operation
            : request.reference.entry,
      })
    return succeed(decodeOutcome(record))
  }

  /** Step 4: the first call saves the intent; the answer waits for the storage commit. */
  function saveIntent(
    access: Access<P>,
    binding: Binding,
    value: HandoffPrepare,
  ): Promise<Outcome<PreadmissionRecord, Failure>> {
    const { bound } = binding
    const basis: DurableEvidence = binding.basis ?? {
      owner: OWNER,
      record: `${bound.tenantText}/${bound.handoff}/advance`,
      revision: '1',
      digest: sha256(canonical(value)),
    }
    return write(bound, {
      phase: 'intent',
      tenant: access.tenant,
      handoff: bound.handoff,
      entry: bound.entry,
      session: bound.session,
      execution: bound.execution,
      intent: {
        request: encodeState(value.request),
        origin: encodeState(binding.origin),
        principal: given.principalIdentity(access.principal),
        qualification: encodeState(basis),
        adoption: encodeState(given.provider),
        materials: null,
      },
    })
  }

  /** Step 6: the outcome of the saved intent, fixed once; the answer is the fixed one. */
  async function fixOutcome(bound: Bound, record: PreadmissionRecord): Reply<HandoffOutcome> {
    const original = decodeIntent(record)
    const decision = decide(original.request, original.qualification)
    const stored: StoredDecision =
      decision.kind === 'prepared' ? { kind: 'prepared', admission: decision.admission } : decision
    const fixed = await write(bound, {
      phase: 'outcome',
      tenant: bound.tenant,
      handoff: record.handoff,
      outcome: {
        kind: decision.kind,
        format: 'intent-relative-v1',
        provider: encodeState(given.provider),
        decision: encodeState(stored),
      },
    })
    if ('failure' in fixed) return fixed
    const outcome = decodeOutcome(fixed.ok)
    return outcome === null
      ? fail(unavailable('the preadmission write did not fix an outcome'))
      : succeed(outcome)
  }

  async function prepare(input: Access<P> & HandoffPrepare): Reply<HandoffOutcome> {
    const { principal, tenant, ...shape } = input
    const judged = judgeHandoffPrepare(shape)
    if ('failure' in judged)
      return fail({ kind: 'invalid', field: judged.failure.field, reason: judged.failure.reason })
    const tenantText = tenantCodec.encode(tenant)
    if (!tenantText.ok) return fail(denied('prepare'))
    const value = judged.ok
    const access = { principal, tenant }
    const binding = await bind(access, tenantText.value, value)
    if ('failure' in binding) return binding
    const held = await recordOf(binding.ok.bound)
    if ('failure' in held) return held
    return admit(access, binding.ok, value, held.ok)
  }

  /**
   * What steps 2 and 3 already decide: a refusal, the original outcome of the held record, or a
   * stale advance. `null`: the request goes on to the intent and the outcome.
   */
  async function decidedEarly(
    bound: Bound,
    value: HandoffPrepare,
    held: PreadmissionRecord | null,
  ): Promise<Outcome<HandoffOutcome, Failure> | null> {
    const saved = value.kind === 'execution' ? await internal(bound, value) : null
    if (saved !== null && 'failure' in saved) return saved
    if (held !== null) {
      const recalled = recall(held, value.request)
      if ('failure' in recalled) return recalled
      if (recalled.ok !== null) return succeed(recalled.ok)
    }
    if (value.kind === 'execution' && saved !== null) {
      const current = await advances(bound, saved.ok, value)
      if ('failure' in current) return current
    }
    return null
  }

  /** Steps 2 to 6 for a bound request and the record its identity holds, if any. */
  async function admit(
    access: Access<P>,
    binding: Binding,
    value: HandoffPrepare,
    held: PreadmissionRecord | null,
  ): Reply<HandoffOutcome> {
    const { bound } = binding
    const early = await decidedEarly(bound, value, held)
    if (early !== null) return early
    let record = held
    if (record === null) {
      const intent = await saveIntent(access, binding, value)
      if ('failure' in intent) return intent
      record = intent.ok
      // Another H already held this Ki: its own outcome, if fixed, is the answer.
      const fixed = decodeOutcome(record)
      if (fixed !== null) return succeed(fixed)
    }
    return fixOutcome(bound, record)
  }

  async function lookup(input: Access<P> & HandoffLookup): Reply<HandoffResolution> {
    const tenantText = tenantCodec.encode(input.tenant)
    if (!tenantText.ok) return fail(denied('read-message-handoff'))
    const target: AgentAccessTarget =
      input.kind === 'execution'
        ? { kind: 'execution', execution: input.execution }
        : { kind: 'input-entry', execution: input.execution, operation: input.operation }
    const allowed = await ports.check(input, 'read-message-handoff', target)
    if ('failure' in allowed) return allowed
    const bound: Bound = {
      tenant: input.tenant,
      tenantText: tenantText.value,
      session: '' as SessionId,
      execution: input.execution,
      handoff: input.kind === 'execution' ? canonical(input.handoff) : '',
      entry: input.kind === 'execution' ? null : entryOf(input.execution, input.operation),
    }
    const held = await recordOf(bound)
    if ('failure' in held) return held
    const record = held.ok
    if (record === null) return succeed({ kind: 'unknown', original: null })
    const outcome = decodeOutcome(record)
    if (outcome !== null) return succeed({ kind: 'recorded', outcome })
    const intent = decodeIntent(record)
    return succeed({
      kind: 'unknown',
      original: { request: intent.request, origin: intent.origin, record: recordEvidence(record) },
    })
  }

  return {
    prepare,
    lookup,
    exclude: async () => fail({ kind: 'unsupported' }),
  }
}

/** `agentMessageHandoff`, made by the body of the plugin. */
class SessionMessageHandoff extends MessageHandoffService<unknown> {
  readonly prepare: MessageHandoff<unknown>['prepare']
  readonly lookup: MessageHandoff<unknown>['lookup']
  readonly exclude: MessageHandoff<unknown>['exclude']
  constructor(ctx: Context, handoff: MessageHandoff<unknown>) {
    super(ctx)
    this.prepare = handoff.prepare
    this.lookup = handoff.lookup
    this.exclude = handoff.exclude
  }
}

type Issue = Readonly<{ message: string; path: readonly string[] }>

function parseConfig(
  value: unknown,
): Readonly<{ value: MessageHandoffConfig }> | Readonly<{ issues: readonly Issue[] }> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { issues: [{ message: 'the configuration must be an object', path: [] }] }
  const { combinationVersion, manifestDigest } = value as Record<string, unknown>
  const issues: Issue[] = []
  if (typeof combinationVersion !== 'string' || combinationVersion === '')
    issues.push({ message: 'a non-empty string', path: ['combinationVersion'] })
  if (typeof manifestDigest !== 'string' || !/^[0-9a-f]{64}$/.test(manifestDigest))
    issues.push({ message: 'a lowercase hex SHA-256', path: ['manifestDigest'] })
  return issues.length > 0
    ? { issues }
    : {
        value: {
          combinationVersion: combinationVersion as string,
          manifestDigest: manifestDigest as string,
        },
      }
}

/**
 * The plugin of `agentMessageHandoff` (row `session-handoff`). It needs `storage`, the trusted
 * `tenantDomainLookup`, `agentAccessCheck` and `session` with the `coordinator` class; while any is
 * absent it stays pending and provides nothing. Its configuration is the declared Session log
 * combination (`combinationVersion`, `manifestDigest`). Stopping makes every call, also through a
 * reference held from before, answer `unavailable`.
 */
export function createSessionMessageHandoffPlugin<P>(input: SessionMessageHandoffInput<P>) {
  return {
    name: 'session-handoff',
    inject: {
      [storageKey]: null,
      [tenantDomainLookupKey]: null,
      [agentAccessCheckKey]: null,
      [sessionKey]: { caller: 'coordinator' as const },
    },
    Config: {
      '~standard': { version: 1 as const, vendor: 'session-adapters', validate: parseConfig },
    },
    apply(ctx: Context, config: MessageHandoffConfig) {
      let stopped = false
      const session = ctx[sessionKey]
      const accessCheck = ctx[agentAccessCheckKey]
      const logger = ctx.logger(LOGGER)
      const handoff = createMessageHandoff<P>(input, {
        storage: ctx[storageKey],
        tenantDomainLookup: ctx[tenantDomainLookupKey],
        readWork: access => session.work.readWork(access as never),
        async check(access, operation, target) {
          let decision
          try {
            decision = await accessCheck.check({
              access: access as Access<unknown>,
              operation,
              target,
            })
          } catch (cause) {
            return fail(unavailable(`the access check threw: ${String(cause)}`))
          }
          return decision.kind === 'allowed'
            ? succeed(decision.evidence)
            : decision.kind === 'denied'
              ? fail(denied(operation))
              : fail(unavailable(decision.diagnostic))
        },
        combination: config,
        stopped: () => stopped,
      })
      const guard =
        <A extends unknown[], R>(call: (...args: A) => Reply<R>) =>
        async (...args: A): Reply<R> => {
          if (stopped) return fail(unavailable('the message handoff provider has stopped'))
          try {
            return await call(...args)
          } catch (cause) {
            logger.error(`a dependency threw: ${String(cause)}`)
            return fail(unavailable(`a dependency threw: ${String(cause)}`))
          }
        }
      new SessionMessageHandoff(ctx, {
        prepare: guard(input => handoff.prepare(input as Access<P> & HandoffPrepare)),
        lookup: guard(input => handoff.lookup(input as Access<P> & HandoffLookup)),
        exclude: guard(input => handoff.exclude(input as never)),
      })
      ctx.effect(() => () => {
        stopped = true
      })
    },
  }
}
