// The connected M2 tenant path (CS v2). Every hop calls a public entry of a contract member through
// a port that the caller passes in; this module imports only root entries and builds no double. The
// caller (the tests of this application) wires the `./testing` doubles. Each hop returns an
// observation with safe evidence labels: no credential, login proof or message body enters it.
//
// The path runs the first round (H01 to H08), reads the Agent records of that round (H13), drives
// the later rounds (H09), and then probes three scenarios in their own sessions: the Tool round
// trip (H10), the reassembly of the Agent instance during a Model call (H11) and the reasoning
// replay (H12). A probe that the upstream public entries refuse reports the refusal as evidence;
// it never builds the missing behavior here.
import { createHash } from 'node:crypto'
import { readModelDeliveryMaterial, type AgentProvider } from '@omne-harness/agent'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId as decodeAgentInputId,
  type AgentExecutionId,
  type AgentExecutionHandle,
  type InputId as AgentInputId,
  type AgentJournal,
  type AgentMaterials,
  type AgentOperationId,
  type Access,
  type Failure,
  type HandoffOutcome,
  type HandoffPrepare,
  type HandoffRequest,
  type MessageHandoff,
  type RequestPreparation,
} from '@omne-harness/agent-contract'
import type { IdentityOperations } from '@omne-harness/identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { AssemblyResult } from '@omne-harness/request-context-contract'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  type DurableEvidence,
  type EntryId,
  type HistoryEntry,
  type HistoryPage,
  type InputId,
  type MutationName,
  type RunId,
  type SessionAccess,
  type SessionAccessCheck,
  type SessionCommand,
  type SessionManagement,
  type SessionReconciliation,
  type SessionWork,
  type SessionCreation,
  type SessionEvidenceBridge,
  type SessionFailure,
  type SessionId,
  type SessionOperationId,
  type SessionTransactionPort,
  type StartedRun,
} from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import {
  encodeGovernanceRequest,
  encodeGovernanceResponse,
  encodeSessionRequest,
  encodeSessionResponse,
  readGovernanceRequest,
  readGovernanceResponse,
  readSessionRequest,
  readSessionResponse,
  type GovernanceEncodeResult,
  type SessionHistoryEntry,
  type SessionOperation,
  type SessionRequest,
  type SessionResponse,
  type SessionResponseEncodeInput,
} from '@omne-harness/public-contract'
import {
  evidenceOf,
  NOT_REACHED,
  type ConnectedObservation,
  type FirstPathHop,
  type FirstPathObservation,
} from './hops.ts'
import { PATH_CODEC_LIMITS } from './limits.ts'

export {
  evidenceOf,
  HOP_IDS,
  NOT_REACHED,
  type ConnectedObservation,
  type FirstPathHop,
  type FirstPathObservation,
} from './hops.ts'

/** The principal of the path: the account that identity recognized from the login proof. */
export type PathPrincipal = string

export const PATH_OWNER = '@omne-harness/m2-contract-skeleton'
const GOVERNANCE_VERSION = 'governance-public/1'
const SESSION_VERSION = 'session-public/1'

/** The sessions of the path: the main rounds and one session for each probe. */
export const PATH_SESSIONS = {
  main: 'session-cs-first',
  tool: 'session-cs-tool',
  reassembly: 'session-cs-reassembly',
  reasoning: 'session-cs-reasoning',
} as const
/** How many rounds the main session drives. */
export const PATH_ROUNDS = 3
/** The default bound on waiting for an Agent reply, in event-loop turns. */
export const DEFAULT_REPLY_TURNS = 2000
/** The page size of every Session history read of the path, in bytes. */
const HISTORY_PAGE_BYTES = 1_000_000

const refused = (...evidence: string[]): ConnectedObservation => ({ kind: 'refused', evidence })
const disconnected = (...evidence: string[]): ConnectedObservation => ({
  kind: 'disconnected',
  evidence,
})
const observed = (connected: boolean, evidence: readonly string[]): ConnectedObservation => ({
  kind: connected ? 'connected' : 'disconnected',
  evidence,
})

/**
 * The label of an observation that one step stopped with a single label, such as a refused path
 * step or a session that was not created.
 */
function firstLabel(observation: ConnectedObservation): string {
  return evidenceOf(observation)[0] ?? 'unknown'
}

/** The kind of an observation that did not connect: a refusal stays one, anything else disconnects. */
function unconnectedKind(observation: ConnectedObservation): 'refused' | 'disconnected' {
  return observation.kind === 'refused' ? 'refused' : 'disconnected'
}

/** The same observation with more evidence labels. */
function withEvidence(observation: ConnectedObservation, more: readonly string[]) {
  return observation.kind === 'not-reached' || more.length === 0
    ? observation
    : { ...observation, evidence: [...observation.evidence, ...more] }
}

/** The Agent Journal and materials of one session on the Session log (#756). */
export type SessionLogAgentJournal = Readonly<{
  journal: AgentJournal<PathPrincipal>
  materials: AgentMaterials<PathPrincipal, ContentBlock>
}>

/** The Session store that the caller assembles with the access check this path injects (#680 B-1). */
export type SessionAssembly = Readonly<{
  transactions: SessionTransactionPort<PathPrincipal>
  /** Session's evidence bridge: the guard materials of every commit, such as the login gate. */
  evidence: SessionEvidenceBridge
  /**
   * The same-log Agent Journal of a session when the store is the Session log of #756. Null when
   * the store carries no Agent Journal; the Agent then keeps its own Journal and H13 is a gap.
   */
  agentJournal: ((access: SessionAccess<PathPrincipal>) => SessionLogAgentJournal) | null
}>

/**
 * What the scripted Model of an Agent answers. `reply`: a text reply for each admitted call.
 * `tool-call`: a reply that carries a tool call. `reasoning`: a reply with a thinking part.
 * `held`: nothing until `releaseModel` is called.
 */
export type AgentScenario = 'reply' | 'tool-call' | 'reasoning' | 'held'

/** The Agent assembled for one tenant, with the two bridges this application owns plugged in. */
export type PathAgent = Readonly<{
  provider: AgentProvider<PathPrincipal>
  journal: AgentJournal<PathPrincipal>
  materials: AgentMaterials<PathPrincipal, ContentBlock>
  /** The Agent instance that Session's `startRun` names. */
  instance: string
  /** Settles the held Model call of the `held` scenario; null when the Model settles on its own. */
  releaseModel: (() => void) | null
  /** How many calls the Model runtime admitted from this Agent (caller-reported). */
  admitted(): number
  /** How many invocations the Tool runtime received from this Agent (caller-reported). */
  toolInvocations(): number
  /**
   * The execution-environment facility calls that the Tool runtime made for this Agent, each with
   * the kind of its answer, such as `files.read:done` (caller-reported).
   */
  toolEffects(): readonly string[]
}>

export type PathDependencies = Readonly<{
  identity: IdentityOperations
  /** The login identifier and credential of the first tenant; they never enter the report. */
  login: Readonly<{ loginIdentifier: string; credential: string }>
  /**
   * The current access decision of every Session read and write. The path hands it to `session`.
   * The caller must give a value: `undefined` is the explicit absence, under which the assembly
   * stays pending and no Session call is made (#680 ruling B-1, item 4). The path never
   * substitutes a default.
   */
  sessionAccessCheck: SessionAccessCheck<PathPrincipal> | undefined
  /** Builds the Session store with the injected access check. */
  session(input: Readonly<{ accessCheck: SessionAccessCheck<PathPrincipal> }>): SessionAssembly
  /** The definition-name mapping entry of the session (application assembly page). */
  creation: SessionCreation
  /** The external inputs of the main session, one for each round; at least `PATH_ROUNDS`. */
  requests: readonly Message[]
  /**
   * Builds the Agent of the tenant. `handoff` and `requests` are the bridges of this module; the
   * caller places them as the Agent's `handoff` and `requests` dependencies. `journal` is the
   * same-log Journal of the session when the Session store supplies one.
   */
  agent(
    input: Readonly<{
      tenant: TenantId
      principal: PathPrincipal
      instance: string
      scenario: AgentScenario
      journal: SessionLogAgentJournal | null
      handoff: MessageHandoff<PathPrincipal>
      requests: RequestPreparation<PathPrincipal>
    }>,
  ): Promise<PathAgent>
  /**
   * Request Context assembly of the tenant over the given Session history messages, through
   * `createAssemblyOperations` and the caller's sources. `lease` reports what the Model preparation
   * resources of those sources saw: leases acquired, leases still open, and plans of an assembled
   * input.
   */
  assemble(
    input: Readonly<{
      tenant: TenantId
      history: readonly Readonly<{ entry: EntryId; message: Message }>[]
    }>,
  ): Promise<
    Readonly<{
      result: AssemblyResult
      lease: Readonly<{ acquired: number; outstanding: number; planned: number }>
    }>
  >
  /**
   * The Agent preparation fields that Request Context does not produce (source, state, schema,
   * budget, coverage). The Agent-side Context adapter that owns them is not supplied (#542).
   */
  preparationFrame: RequestPreparation<PathPrincipal>['prepare']
  /** Upper bound on waiting for the Agent reply, in event-loop turns. Default 2000. */
  replyTurns?: number
}>

/**
 * A refusal inside a path step. It carries only the step name that this application mints and the
 * `kind` of the failure, never free text of a supplier or a port.
 */
export class PathStepError extends Error {
  readonly step: string
  readonly kind: string
  constructor(step: string, kind: string) {
    super(`${step}:${kind}`)
    this.name = 'PathStepError'
    this.step = step
    this.kind = kind
  }
}

/** The `kind` of a failure value, or `unknown` when it has no string `kind`. */
export function kindOf(failure: unknown): string {
  return typeof failure === 'object' &&
    failure !== null &&
    'kind' in failure &&
    typeof failure.kind === 'string'
    ? failure.kind
    : 'unknown'
}

function encoded(result: GovernanceEncodeResult): Uint8Array {
  if (result.kind !== 'encoded') throw new PathStepError('governance-encode', result.kind)
  return result.bytes
}

function okOf<T>(outcome: { ok: T } | { failure: unknown }, what: string): T {
  if ('failure' in outcome) throw new PathStepError(what, kindOf(outcome.failure))
  return outcome.ok
}

/** An Agent operation id that this module fixes; decoded once, when the module loads. */
function fixedOperation(raw: string): AgentOperationId {
  return okOf(decodeAgentOperationId(raw), `fixed-operation:${raw}`)
}
const QUIESCE_OPERATION = fixedOperation('quiesce-cs')
const DETACH_OPERATION = fixedOperation('detach-cs')
const RESUME_OPERATION = fixedOperation('resume-cs')

/** A Session operation id minted by the caller for the intake operations of this path. */
const callerOperation = (name: string): SessionOperationId => `sop_cs-${name}` as SessionOperationId
/** A Session id of this path; the ids are fixed names of `PATH_SESSIONS`. */
const pathSession = (name: string): SessionId => name as SessionId

function evidence(record: string): DurableEvidence {
  return { owner: PATH_OWNER, record, revision: '1', digest: `sha256:${record}` }
}

function textOf(message: Message): string {
  return message.blocks
    .map(block => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('')
}

/** The value of a member of a json-text object, or null when the value is not an object with it. */
function fieldOf(value: JsonValue, key: string): JsonValue | null {
  if (value.kind !== 'object') return null
  return value.entries.find(entry => entry.key === key)?.value ?? null
}

/** The string value of a member of a json-text object, or null. */
function stringField(value: JsonValue, key: string): string | null {
  const field = fieldOf(value, key)
  return field?.kind === 'string' ? field.value : null
}

/** A message judged from a json-text value. */
function judgedMessage(value: JsonValue): Message | null {
  const judged = judgeMessage(JSON.parse(writeJsonText(value)))
  return 'ok' in judged ? judged.ok : null
}

/** The message of a Session message entry, read back from its json-text payload. */
export function messageOf(entry: Pick<HistoryEntry, 'kind' | 'payload'>): Message | null {
  if (!entry.kind.startsWith('message.')) return null
  const message = fieldOf(entry.payload, 'message')
  return message === null ? null : judgedMessage(message)
}

/** Waits at most `turns` event-loop turns for `done` to become true. */
async function waitTurns(turns: number, done: () => boolean): Promise<'done' | 'timed-out'> {
  for (let turn = 0; turn < turns; turn += 1) {
    if (done()) return 'done'
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return done() ? 'done' : 'timed-out'
}

// ---------------------------------------------------------------------------------------------
// H01 and H02: governance over identity

type Identified = Readonly<{ tenant: TenantId; principal: PathPrincipal; loginProof: string }>

export async function registerTenant(
  deps: Pick<PathDependencies, 'identity' | 'login'>,
): Promise<Readonly<{ observation: ConnectedObservation; tenant: TenantId | null }>> {
  const request = readGovernanceRequest({
    bytes: encoded(
      encodeGovernanceRequest({
        request: {
          protocolVersion: GOVERNANCE_VERSION,
          messageId: 'cs-register',
          operation: 'register-and-activate',
          body: deps.login,
        },
        limits: PATH_CODEC_LIMITS,
      }),
    ),
    limits: PATH_CODEC_LIMITS,
  })
  if (request.kind !== 'request' || request.request.operation !== 'register-and-activate')
    return { observation: refused('register-request-not-read'), tenant: null }
  const outcome = await deps.identity.registerAndActivate(request.request.body)
  if (outcome.kind !== 'succeeded')
    return { observation: refused(`identity-register:${outcome.kind}`), tenant: null }
  const response = readGovernanceResponse({
    bytes: encoded(
      encodeGovernanceResponse({
        operation: 'register-and-activate',
        response: {
          protocolVersion: GOVERNANCE_VERSION,
          messageId: request.request.messageId,
          outcome: 'succeeded',
          body: {
            accountId: outcome.account,
            organizationId: outcome.organization,
            tenantId: outcome.tenant,
          },
        },
        limits: PATH_CODEC_LIMITS,
      }),
    ),
    operation: 'register-and-activate',
    expectedMessageId: 'cs-register',
    limits: PATH_CODEC_LIMITS,
  })
  if (
    response.kind !== 'response' ||
    response.response.outcome !== 'succeeded' ||
    !('tenantId' in response.response.body)
  )
    return { observation: refused('register-response-not-read'), tenant: null }
  const tenant = response.response.body.tenantId
  return {
    observation: observed(tenantEquals(tenant, outcome.tenant), [
      'public-contract:register-and-activate request read',
      'identity:registerAndActivate succeeded',
      'public-contract:register-and-activate response read with the identity tenant',
    ]),
    tenant,
  }
}

type IssuedLogin = Extract<
  Awaited<ReturnType<IdentityOperations['issueLogin']>>,
  { kind: 'succeeded' }
>

/** The `issue-login` response through the governance codec; the login proof it carries, or null. */
function carryLoginProof(issued: IssuedLogin, messageId: string): string | null {
  const response = readGovernanceResponse({
    bytes: encoded(
      encodeGovernanceResponse({
        operation: 'issue-login',
        response: {
          protocolVersion: GOVERNANCE_VERSION,
          messageId,
          outcome: 'succeeded',
          body: {
            loginIdentifier: issued.loginIdentifier,
            issuedAt: issued.issuedAt,
            tenantId: issued.tenant,
            loginProof: issued.loginProof,
          },
        },
        limits: PATH_CODEC_LIMITS,
      }),
    ),
    operation: 'issue-login',
    expectedMessageId: 'cs-login',
    limits: PATH_CODEC_LIMITS,
  })
  if (response.kind !== 'response' || response.response.outcome !== 'succeeded') return null
  return 'loginProof' in response.response.body ? response.response.body.loginProof : null
}

export async function logIn(
  deps: Pick<PathDependencies, 'identity' | 'login'>,
  tenant: TenantId,
): Promise<Readonly<{ observation: ConnectedObservation; identified: Identified | null }>> {
  const request = readGovernanceRequest({
    bytes: encoded(
      encodeGovernanceRequest({
        request: {
          protocolVersion: GOVERNANCE_VERSION,
          messageId: 'cs-login',
          operation: 'issue-login',
          body: deps.login,
        },
        limits: PATH_CODEC_LIMITS,
      }),
    ),
    limits: PATH_CODEC_LIMITS,
  })
  if (request.kind !== 'request' || request.request.operation !== 'issue-login')
    return { observation: refused('login-request-not-read'), identified: null }
  const issued = await deps.identity.issueLogin(request.request.body)
  if (issued.kind !== 'succeeded')
    return { observation: refused(`identity-login:${issued.kind}`), identified: null }
  const loginProof = carryLoginProof(issued, request.request.messageId)
  if (loginProof === null)
    return { observation: refused('login-response-not-read'), identified: null }
  const recognized = await deps.identity.recognizeLogin({ loginProof })
  if (recognized.kind !== 'recognized')
    return { observation: refused(`identity-recognize:${recognized.kind}`), identified: null }
  const same = tenantEquals(recognized.tenant, tenant)
  return {
    observation: observed(same, [
      'public-contract:issue-login request read',
      'identity:issueLogin succeeded',
      'public-contract:issue-login response read',
      same
        ? 'identity:recognizeLogin recognized the registered tenant'
        : 'identity:recognizeLogin recognized another tenant',
    ]),
    identified: same ? { tenant, principal: String(recognized.account), loginProof } : null,
  }
}

// ---------------------------------------------------------------------------------------------
// The session wire: the public session codecs of #685, carried in process

/**
 * The wire identifier of a session: the 64-hex digest that `create-session` returns. Deriving it
 * from the Session id is the mapping that the server entry owns (M2); this application mints it
 * for the loop-back only (GAP-SESSION-WIRE).
 */
export function wireSessionOf(session: SessionId): string {
  return createHash('sha256').update(String(session)).digest('hex')
}

/** Encodes a session request, reads it back, and returns the read request of that operation. */
function carrySessionRequest(request: SessionRequest): SessionRequest | null {
  const bytes = encodeSessionRequest({ request, limits: PATH_CODEC_LIMITS })
  if (bytes.kind !== 'encoded') return null
  const read = readSessionRequest({ bytes: bytes.bytes, limits: PATH_CODEC_LIMITS })
  if (read.kind !== 'request' || read.request.operation !== request.operation) return null
  return read.request
}

/** Encodes a session response, reads it back, and returns the read response. */
function carrySessionResponse<O extends SessionOperation>(
  input: SessionResponseEncodeInput<O> & Readonly<{ operation: O }>,
  expectedMessageId: string,
): SessionResponse<O> | null {
  const bytes = encodeSessionResponse(input)
  if (bytes.kind !== 'encoded') return null
  const read = readSessionResponse({
    bytes: bytes.bytes,
    operation: input.operation,
    expectedMessageId,
    limits: PATH_CODEC_LIMITS,
  })
  return read.kind === 'response' ? read.response : null
}

function proofOf(identified: Identified) {
  return { kind: 'present' as const, value: identified.loginProof }
}

// ---------------------------------------------------------------------------------------------
// The bridges this application owns: Agent -> Session message hand-over, Agent -> Request Context

/** Session work that the bridges and the hops share. */
type Mutations = SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>
type Commit<K extends MutationName> = Awaited<ReturnType<Mutations[K]>>

type SessionScene = Readonly<{
  access: SessionAccess<PathPrincipal>
  commit<K extends MutationName>(command: Extract<SessionCommand, { kind: K }>): Promise<Commit<K>>
  /** The first history page; `kinds` selects entry kinds, and an empty list selects every kind. */
  history(kinds?: readonly string[]): Promise<HistoryPage>
}>

/** The entry kinds a deployment discloses through `read-history` by default (public-contract SPEC「历史页」). */
const DISCLOSED_HISTORY_KINDS = ['message.user', 'message.assistant'] as const

function sessionScene(
  port: SessionTransactionPort<PathPrincipal>,
  bridge: SessionEvidenceBridge,
  access: SessionAccess<PathPrincipal>,
): SessionScene {
  return {
    access,
    async commit<K extends MutationName>(
      command: Extract<SessionCommand, { kind: K }>,
    ): Promise<Commit<K>> {
      const guards = await bridge.prepare(command)
      if ('failure' in guards) return guards as Commit<K>
      return (await port.commit<K>({ access, command, guards: guards.ok })) as Commit<K>
    },
    async history(kinds = []) {
      return okOf(
        await port.history.begin({
          ...access,
          kinds: [...kinds],
          from: null,
          direction: 'forward',
          pageBytes: HISTORY_PAGE_BYTES,
        }),
        'history.begin',
      )
    },
  }
}

/** What the bridges observed for one round, that is one Agent execution. */
export type BridgeLog = {
  /** External inputs the message hand-over admitted for the Agent. */
  admitted: number
  /** Whether the Session side holds the hand-over of the round's input. */
  handedOver: boolean
  /** The last Model reply that the message bridge committed to Session. */
  reply: Readonly<{ text: string; call: string; source: DurableEvidence }> | null
  /** How many Model replies the message bridge committed to Session. */
  replies: number
  /** Whether the round's wait for the reply ended by its bound. */
  waited: 'done' | 'timed-out' | null
  assembled: number
  fixed: number
  fixedMessages: number
  /** The block kinds that the fixed requests of the round carried. */
  requestBlocks: Set<string>
  historyMessages: number
  lease: Readonly<{ acquired: number; outstanding: number; planned: number }> | null
  failures: string[]
}

/** The Session binding of one round: its input, and the messages written for its execution. */
export type Round = { sessionInput: InputId; written: number; log: BridgeLog }

export function emptyLog(): BridgeLog {
  return {
    admitted: 0,
    handedOver: false,
    reply: null,
    replies: 0,
    waited: null,
    assembled: 0,
    fixed: 0,
    fixedMessages: 0,
    requestBlocks: new Set(),
    historyMessages: 0,
    lease: null,
    failures: [],
  }
}

/** The rounds of one session, by the Agent execution of each. The bridges route by execution. */
export type Rounds = Readonly<{
  get(execution: string): Round | undefined
  open(execution: string, round: Round): void
}>

export function roundsOf(): Rounds {
  const rounds = new Map<string, Round>()
  return {
    get: execution => rounds.get(execution),
    open: (execution, round) => {
      rounds.set(execution, round)
    },
  }
}

/** The adoption this application fixes as the provider of every admission it decides. */
const HANDOFF_PROVIDER = {
  owner: PATH_OWNER,
  name: 'message-bridge',
  revision: '1',
  digest: `${PATH_OWNER}:message-bridge`,
}

/** The identity text of one H: the internal operation, or the entry index Ki with the input. */
function handoffKey(reference: HandoffRequest['reference']): string {
  return reference.kind === 'execution'
    ? `execution/${String(reference.execution)}/${String(reference.operation)}`
    : `input/${String(reference.execution)}/${String(reference.entry)}/${String(reference.input)}`
}

/** The `prepare` branches this bridge decides: the invoke input and the internal candidates. */
type DecidedPrepare = Exclude<HandoffPrepare, { kind: 'submit' }>

/** The fixed outcome of `request`: the exact message with its admission, or the rejection. */
function outcomeOf(input: DecidedPrepare, decision: HandoffOutcome['decision']): HandoffOutcome {
  const key = handoffKey(input.request.reference)
  return {
    request: input.request,
    origin: input.kind === 'invoke' ? { kind: 'invoke', ...input.runtime } : null,
    provider: HANDOFF_PROVIDER,
    qualification: evidence(`handoff/qualification/${key}`),
    record: evidence(`handoff/record/${key}`),
    decision,
  }
}

const rejected = (
  round: Round | undefined,
  input: DecidedPrepare,
  reason: string,
): HandoffOutcome => {
  round?.log.failures.push(reason)
  return outcomeOf(input, {
    kind: 'rejected',
    reason,
    evidence: evidence(`handoff/rejected/${reason}`),
  })
}

/**
 * The Session write the message bridge makes: one `recordMessage` under the session's access,
 * answering the source of the commit or the Session failure.
 */
export type MessageWriter = Readonly<{
  access: SessionAccess<PathPrincipal>
  recordMessage(
    input: Extract<SessionCommand, { kind: 'recordMessage' }>['input'],
  ): Promise<Readonly<{ ok: DurableEvidence }> | Readonly<{ failure: SessionFailure }>>
}>

/** What `decide` answers: a fixed outcome of the H, or a failure that fixes nothing. */
type Decision = Readonly<{ ok: HandoffOutcome }> | Readonly<{ failure: Failure }>

/**
 * The Agent failure of a refused Session `recordMessage`. Only a real validation refusal fixes a
 * rejection; an unavailable store, an unknown commit and every other refusal come back as a failure
 * of the same class and fix nothing, so a retry of the same H decides it again.
 */
function messageFailure(
  failure: SessionFailure,
  request: HandoffRequest,
): Readonly<{ fixed: true }> | Readonly<{ fixed: false; failure: Failure }> {
  switch (failure.kind) {
    case 'invalid':
      return { fixed: true }
    case 'unavailable':
      return { fixed: false, failure }
    case 'quarantined':
      return {
        fixed: false,
        failure: { kind: 'unavailable', owner: 'session-history', diagnostic: failure.diagnostic },
      }
    case 'commit-unknown':
      return { fixed: false, failure: { kind: 'commit-unknown', operation: operationOf(request) } }
    case 'denied':
      return { fixed: false, failure: { kind: 'denied', action: failure.action } }
    case 'conflict':
      return { fixed: false, failure: { kind: 'conflict', operation: operationOf(request) } }
    case 'stale-advance':
      return { fixed: false, failure: { kind: 'stale-advance' } }
    default:
      return {
        fixed: false,
        failure: {
          kind: 'unavailable',
          owner: PATH_OWNER,
          diagnostic: `session-recordMessage:${failure.kind}`,
        },
      }
  }
}

/** The canonical text of a request: the same members give the same text in any key order. */
function canonicalText(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : item,
  )
}

/**
 * The Agent message hand-over of this application (`MessageHandoff`). `prepare` fixes the
 * admission of the external input; the Session-side `receive(input-handover)` is committed by the
 * round driver once the Agent accepted the invoke, as the drive adapter of the Session coordinator
 * would (GAP-SESSION-COORDINATOR). For a Model reply, `prepare` commits the Session message as a
 * `message` participation when it fixes the prepared outcome: this stand-in writes the message
 * there, while the Session-side `agentMessageHandoff` plugin writes it through the Ja (session-adapters
 * SPEC J06); the difference is part of GAP-SESSION-COORDINATOR. Each call is routed to its round by
 * the execution it names. Only a fixed outcome is kept: a second `prepare` of the same request
 * answers it, a different request for the same H is a conflict, and `lookup` reads it back. A
 * `prepare` of an H already in progress waits for that call; it does not decide the H twice. A
 * failure that is not a validation refusal fixes nothing (no Session round, a source this stand-in
 * does not decide, an unavailable or unknown Session write). `exclude` answers a fixed outcome as
 * recorded when it names the same request, and invalid otherwise; without a trusted P resolver and
 * a durable fence it answers unsupported for any other H. A submit needs the trusted Ki migration,
 * so its `prepare` answers unsupported. The bridge does not check the `read-message-handoff` or
 * `exclude-message-handoff` access of the caller, the advance of an execution `prepare`, or the
 * tenant of `lookup` and `exclude` (GAP-SESSION-COORDINATOR).
 */
export function messageBridge(scene: MessageWriter, rounds: Rounds): MessageHandoff<PathPrincipal> {
  const fixed = new Map<string, Readonly<{ request: string; outcome: HandoffOutcome }>>()
  const running = new Map<string, Readonly<{ request: string; answer: Promise<Decision> }>>()
  const decide = async (input: DecidedPrepare): Promise<Decision> => {
    const request = input.request
    const execution = String(request.reference.execution)
    const round = rounds.get(execution)
    if (round === undefined)
      return { failure: { kind: 'unavailable', owner: PATH_OWNER, diagnostic: 'no-session-run' } }
    if (input.kind === 'invoke') {
      if (String(input.request.source.input) !== String(round.sessionInput))
        return { ok: rejected(round, input, 'external-input:not-the-session-input') }
      round.log.admitted += 1
      const entry = input.request.entry
      return {
        ok: outcomeOf(input, {
          kind: 'prepared',
          message: entry.kind === 'invoke' ? entry.initial.content : entry.value.content,
          admission: evidence(`handoff/admitted/${String(input.request.source.input)}`),
        }),
      }
    }
    const source = input.request.source
    if (source.kind !== 'model-reply') {
      round.log.failures.push(`unsupported-source:${source.kind}`)
      return { failure: { kind: 'unsupported' } }
    }
    const written = round.written + 1
    const agentOperation = `agent-${String(source.call)}`
    const operation = String(input.request.reference.operation)
    const committed = await scene.recordMessage({
      tenant: scene.access.tenant,
      session: scene.access.session,
      operation: deriveSessionOperation({
        kind: 'participation',
        execution,
        operation: agentOperation,
        joint: 'message',
      }),
      participation: {
        execution,
        operation: agentOperation,
        joint: 'message',
        written: String(written),
        handover: evidence(`agent/message/${operation}`),
      },
      value: {
        message: input.request.candidate,
        source: source.result.source,
        admission: evidence(`agent/admission/${operation}`),
        consumption: null,
      },
    })
    if ('failure' in committed) {
      const reason = `session-recordMessage:${committed.failure.kind}`
      const mapped = messageFailure(committed.failure, input.request)
      if (mapped.fixed) return { ok: rejected(round, input, reason) }
      round.log.failures.push(reason)
      return { failure: mapped.failure }
    }
    round.written = written
    round.log.reply = {
      text: textOf(input.request.candidate),
      call: String(source.call),
      source: committed.ok,
    }
    round.log.replies += 1
    return {
      ok: outcomeOf(input, {
        kind: 'prepared',
        message: input.request.candidate,
        admission: committed.ok,
      }),
    }
  }
  return {
    async prepare(input) {
      const { principal: _principal, tenant: _tenant, ...shape } = input
      // A submit needs the trusted Ki migration and the original execution binding, which this
      // bridge does not have. It answers unsupported and fixes no outcome, so the Ki is not
      // closed by a stand-in rejection (agent-contract SPEC "消息准入").
      if (shape.kind === 'submit') return unsupported()
      const key = handoffKey(shape.request.reference)
      const text = canonicalText(shape.request)
      const conflicting = {
        failure: { kind: 'conflict' as const, operation: operationOf(shape.request) },
      }
      const known = fixed.get(key)
      if (known !== undefined) return known.request === text ? { ok: known.outcome } : conflicting
      // The same H in progress is recognized or refused before any new work (agent-contract SPEC
      // "消息准入", per-operation table): the second call waits for the first.
      const current = running.get(key)
      if (current !== undefined) return current.request === text ? current.answer : conflicting
      const answer = decide(shape)
        .then(decision => {
          if ('ok' in decision) fixed.set(key, { request: text, outcome: decision.ok })
          return decision
        })
        .finally(() => running.delete(key))
      running.set(key, { request: text, answer })
      return answer
    },
    async lookup(input) {
      const reference =
        input.kind === 'execution'
          ? input.handoff
          : [...fixed.values()].find(
              item =>
                item.outcome.request.reference.kind === 'input' &&
                item.outcome.request.reference.execution === input.execution &&
                item.outcome.request.reference.entry === input.operation,
            )?.outcome.request.reference
      const known = reference === undefined ? undefined : fixed.get(handoffKey(reference))
      return {
        ok:
          known === undefined
            ? { kind: 'unknown', original: null }
            : { kind: 'recorded', outcome: known.outcome },
      }
    },
    async exclude(input) {
      // A fixed outcome is answered as recorded, never turned into an exclusion. This bridge has no
      // trusted Journal resolver for P and no durable fence, so it cannot exclude an H it has not
      // decided: it answers unsupported (agent-contract SPEC "消息准入"), not an empty success.
      const known = fixed.get(handoffKey(input.request.reference))
      if (known === undefined) return unsupported()
      if (known.request !== canonicalText(input.request))
        return {
          failure: {
            kind: 'invalid',
            field: 'request',
            reason: 'not the request of the fixed outcome of this H',
          },
        }
      return { ok: { kind: 'recorded', outcome: known.outcome } }
    },
  }
}

/** The operation an H names for a conflict: the internal operation, or the original entry O. */
function operationOf(request: HandoffRequest): AgentOperationId {
  return request.reference.kind === 'execution'
    ? request.reference.operation
    : request.reference.entry
}

const unsupported = async () => ({ failure: { kind: 'unsupported' as const } })

function contextBridge(
  scene: SessionScene,
  tenant: TenantId,
  deps: Pick<PathDependencies, 'assemble' | 'preparationFrame'>,
  rounds: Rounds,
): RequestPreparation<PathPrincipal> {
  return {
    async prepare(input) {
      const round = rounds.get(String(input.advance.execution))
      if (round === undefined)
        return { failure: { kind: 'unavailable', owner: PATH_OWNER, diagnostic: 'no-session-run' } }
      const frame = await deps.preparationFrame(input)
      if ('failure' in frame || frame.ok.kind !== 'ready') return frame
      const { request, capacity: _capacity, ...common } = frame.ok
      const previous = input.previous
      if (previous === null) return assembleRequest(scene, tenant, deps, round.log, common)
      // P1: fix the request from the assembled input of P0, carrying Request Context's content.
      if (previous.kind !== 'assembled') return frame
      // The representation and source adoptions stay the frame's: the Request Context testing
      // policies carry adoption digests that the Model request check refuses (see SPEC H05).
      const { system, messages, tools, toolChoice } = previous.input
      round.log.fixed += 1
      round.log.fixedMessages = messages.length
      for (const message of messages)
        for (const block of message.blocks) round.log.requestBlocks.add(block.kind)
      return { ok: { ...frame.ok, request: { ...request, system, messages, tools, toolChoice } } }
    },
    derive: unsupported,
    resume: unsupported,
  }
}

type ReadyFrame = Omit<
  Extract<
    Extract<
      Awaited<ReturnType<RequestPreparation<PathPrincipal>['prepare']>>,
      { ok: unknown }
    >['ok'],
    { kind: 'ready' }
  >,
  'request' | 'capacity'
>

/** P0: assemble the request input through Request Context over the Session history. */
async function assembleRequest(
  scene: SessionScene,
  tenant: TenantId,
  deps: Pick<PathDependencies, 'assemble'>,
  log: BridgeLog,
  common: ReadyFrame,
): ReturnType<RequestPreparation<PathPrincipal>['prepare']> {
  const page = await scene.history()
  const history = page.entries.flatMap(entry => {
    const message = messageOf(entry)
    return message === null ? [] : [{ entry: entry.id, message }]
  })
  const { result: assembled, lease } = await deps.assemble({ tenant, history })
  log.lease = lease
  if (assembled.kind !== 'candidate-fixable' && assembled.kind !== 'candidate-before-extension') {
    log.failures.push(`rq-assemble:${assembled.kind}`)
    return {
      failure: {
        kind: 'unavailable',
        owner: PATH_OWNER,
        diagnostic: `request context: ${assembled.kind}`,
      },
    }
  }
  log.assembled += 1
  log.historyMessages = history.length
  return { ok: { ...common, kind: 'assembled', input: assembled.candidate.assembled } }
}

// ---------------------------------------------------------------------------------------------
// The context of the path and of one session

type PathContext = Readonly<{
  deps: PathDependencies
  assembly: SessionAssembly
  identified: Identified
  /** The bound on each wait for the Agent, in event-loop turns. */
  turns: number
}>

/** One session of the path: its Session scene, the bridges of its rounds, and its same-log Journal. */
type OpenSession = Readonly<{
  scene: SessionScene
  rounds: Rounds
  handoff: MessageHandoff<PathPrincipal>
  requests: RequestPreparation<PathPrincipal>
  journal: SessionLogAgentJournal | null
}>

/** H03: create the session for the recognized tenant and principal through `create-session`. */
async function openSession(
  context: PathContext,
  session: SessionId,
): Promise<Readonly<{ observation: ConnectedObservation; session: OpenSession | null }>> {
  const { deps, assembly, identified } = context
  const access: SessionAccess<PathPrincipal> = {
    principal: identified.principal,
    tenant: identified.tenant,
    session,
  }
  const scene = sessionScene(assembly.transactions, assembly.evidence, access)
  const created = await createSession(context, scene)
  if (created.kind !== 'connected') return { observation: created, session: null }
  const rounds = roundsOf()
  return {
    observation: created,
    session: {
      scene,
      rounds,
      handoff: messageBridge(
        {
          access: scene.access,
          recordMessage: async input => {
            const committed = await scene.commit<'recordMessage'>({ kind: 'recordMessage', input })
            return 'failure' in committed ? committed : { ok: committed.ok.source }
          },
        },
        rounds,
      ),
      requests: contextBridge(scene, identified.tenant, deps, rounds),
      journal: assembly.agentJournal?.(access) ?? null,
    },
  }
}

async function createSession(
  { deps, assembly, identified }: PathContext,
  scene: SessionScene,
): Promise<ConnectedObservation> {
  const { access } = scene
  const messageId = `cs-create-${String(access.session)}`
  const request = carrySessionRequest({
    protocolVersion: SESSION_VERSION,
    messageId,
    operation: 'create-session',
    proof: proofOf(identified),
    actingTenant: identified.tenant,
    body: {
      createCallId: `create-${String(access.session)}`,
      definition: deps.creation.definition.name,
      purpose: deps.creation.purpose,
    },
  })
  if (request === null || request.operation !== 'create-session')
    return refused('session-create-request-not-read')
  if (!tenantEquals(request.actingTenant, identified.tenant))
    return refused('session-create-request-foreign-tenant')
  const created = await scene.commit<'create'>({
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: callerOperation(request.body.createCallId),
      creation: deps.creation,
    },
  })
  if ('failure' in created) return refused(`session-create:${created.failure.kind}`)
  return confirmCreated(assembly, access, messageId, created.ok.receipt.recovered)
}

/** The `create-session` response through the session codec, and the session that `readWork` returns. */
async function confirmCreated(
  assembly: SessionAssembly,
  access: SessionAccess<PathPrincipal>,
  messageId: string,
  recovered: boolean,
): Promise<ConnectedObservation> {
  const response = carrySessionResponse(
    {
      operation: 'create-session',
      response: {
        protocolVersion: SESSION_VERSION,
        messageId,
        outcome: 'succeeded',
        body: { session: wireSessionOf(access.session), recovered },
      },
      limits: PATH_CODEC_LIMITS,
    },
    messageId,
  )
  if (response === null || response.outcome !== 'succeeded')
    return refused('session-create-response-not-read')
  if (response.body.session.length !== 64)
    return disconnected('public-contract:create-session response carries no 64-hex wire session')
  const work = await assembly.transactions.readWork(access)
  if ('failure' in work) return refused(`session-readWork:${work.failure.kind}`)
  if (work.ok.session !== access.session)
    return disconnected('session-contract:readWork returns another session')
  return observed(true, [
    'public-contract:create-session request read with the acting tenant',
    'session-contract:commit(create) committed for the identity tenant',
    'public-contract:create-session response read with the wire session',
    'session-contract:readWork returns the session',
  ])
}

// ---------------------------------------------------------------------------------------------
// One round: accept the input through `send-input`, start the Run, invoke the Agent, wait

/** The step of a round where it stopped. */
type DriveStage = 'send-input' | 'accept' | 'startRun' | 'identity' | 'readInput' | 'invoke'

/** A round that stopped before the Agent took the input, or one that the Agent took. */
type Drive =
  | Readonly<{
      kind: 'stopped'
      stage: DriveStage
      observation: ConnectedObservation
      log: BridgeLog
    }>
  | DrivenRound

type DrivenRound = Readonly<{
  kind: 'driven'
  observation: ConnectedObservation
  /** The step where the round stopped short of a reply; null when the Agent replied. */
  stop: string | null
  agent: PathAgent
  execution: AgentExecutionId
  run: RunId
  handle: AgentExecutionHandle<PathPrincipal>
  log: BridgeLog
}>

/** One step of a round: its value, or the stage and label where the round stopped. */
type Step<T> = Readonly<{ ok: T }> | Readonly<{ stop: DriveStage; label: string }>

type RoundInput = Readonly<{
  round: number
  message: Message
  scenario: AgentScenario
  instance: string
  /** The Agent of an earlier round, reused; null builds a new one. */
  existing: PathAgent | null
}>

/** The `send-input` carriage of one external input; null when the codec did not carry it. */
function carryInput(
  identified: Identified,
  session: SessionId,
  sessionInput: InputId,
  message: Message,
): Message | null {
  const plain = readJsonText(JSON.stringify(message), PATH_CODEC_LIMITS)
  if (plain.kind !== 'ok' || plain.value.kind !== 'object') return null
  const request = carrySessionRequest({
    protocolVersion: SESSION_VERSION,
    messageId: `cs-send-${String(sessionInput)}`,
    operation: 'send-input',
    proof: proofOf(identified),
    body: {
      tenant: identified.tenant,
      session: wireSessionOf(session),
      acceptId: `accept-${String(sessionInput)}`,
      inputId: String(sessionInput),
      message: plain.value,
    },
  })
  if (
    request === null ||
    request.operation !== 'send-input' ||
    !tenantEquals(request.body.tenant, identified.tenant)
  )
    return null
  return judgedMessage(request.body.message)
}

/** The input of a round through `send-input`, committed as an ordinary request. */
async function acceptInput(
  { identified }: PathContext,
  { scene }: OpenSession,
  input: RoundInput,
): Promise<Step<InputId>> {
  const sessionInput = `input-cs-${input.round}` as InputId
  const message = carryInput(identified, scene.access.session, sessionInput, input.message)
  if (message === null) return { stop: 'send-input', label: 'session-send-input-not-read' }
  const accepted = await scene.commit<'accept'>({
    kind: 'accept',
    input: {
      tenant: scene.access.tenant,
      session: scene.access.session,
      operation: callerOperation(`accept-${sessionInput}`),
      value: {
        kind: 'ordinary',
        input: sessionInput,
        message,
        // The access layer marks a request that arrived after a successful login (#318 design).
        origin: { ...evidence(`login-entry/${sessionInput}`), owner: 'login-entry' },
      },
    },
  })
  if ('failure' in accepted)
    return { stop: 'accept', label: `session-accept:${accepted.failure.kind}` }
  return { ok: sessionInput }
}

/** The Agent of the round: the one of an earlier round, or a new one with this session's bridges. */
async function agentOf(
  { deps, identified }: PathContext,
  session: OpenSession,
  input: RoundInput,
): Promise<PathAgent> {
  return (
    input.existing ??
    deps.agent({
      principal: identified.principal,
      tenant: identified.tenant,
      instance: input.instance,
      scenario: input.scenario,
      journal: session.journal,
      handoff: session.handoff,
      requests: session.requests,
    })
  )
}

type StartedRound = Readonly<{
  started: StartedRun
  execution: AgentExecutionId
  agentInput: AgentInputId
  operation: AgentOperationId
}>

/** `startRun` for the Agent instance, and the Agent identities of the execution it opened. */
async function startRun(
  { deps }: PathContext,
  { scene }: OpenSession,
  agent: PathAgent,
  round: number,
): Promise<Step<StartedRound>> {
  const outcome = await scene.commit<'startRun'>({
    kind: 'startRun',
    input: {
      tenant: scene.access.tenant,
      session: scene.access.session,
      operation: callerOperation(`start-run-${round}`),
      entry: 'interactive',
      candidate: deps.creation.definition.candidate,
      instance: { owner: 'agent', id: agent.instance },
    },
  })
  if ('failure' in outcome)
    return { stop: 'startRun', label: `session-startRun:${outcome.failure.kind}` }
  const started = outcome.ok
  const execution = decodeAgentExecutionId(started.execution)
  const agentInput = decodeAgentInputId(String(started.first))
  const operation = decodeAgentOperationId(
    deriveDriveOperation({
      kind: 'invoke',
      execution: started.execution,
      first: started.first,
      started: started.receipt.source,
    }),
  )
  if ('failure' in execution || 'failure' in agentInput || 'failure' in operation)
    return { stop: 'identity', label: 'session-execution-or-input-not-an-agent-identity' }
  return {
    ok: { started, execution: execution.ok, agentInput: agentInput.ok, operation: operation.ok },
  }
}

/** The Agent invoke with the input as Session admitted it: its identity, content and, on the Session log, origin. */
async function invokeAgent(
  { assembly, identified }: PathContext,
  { scene, journal }: OpenSession,
  agent: PathAgent,
  { started, execution, agentInput, operation }: StartedRound,
): Promise<Step<AgentExecutionHandle<PathPrincipal>>> {
  const admitted = await assembly.transactions.readInput({ ...scene.access, input: started.first })
  if ('failure' in admitted)
    return { stop: 'readInput', label: `session-readInput:${admitted.failure.kind}` }
  const invoked = await agent.provider.runtime.invoke({
    principal: identified.principal,
    tenant: identified.tenant,
    execution,
    operation,
    initial: {
      id: agentInput,
      content: admitted.ok.message,
      // A standalone Journal refuses a non-null input source before any write (agent-contract
      // SPEC "提交参加者协议"); the Session origin goes only to the Journal on the Session log.
      source: journal === null ? null : admitted.ok.origin,
      priority: 'ordinary',
    },
    // A Journal on the Session log checks the grant of the Run; an independent Journal takes none.
    grant: journal === null ? null : started.receipt.source,
  })
  if ('failure' in invoked)
    return { stop: 'invoke', label: `agent-invoke:${kindOf(invoked.failure)}` }
  return { ok: invoked.ok }
}

/**
 * One round of the session: the input through `send-input`, the Run, the hand-over to Agent, and
 * the wait for the Agent reply.
 */
async function driveRound(
  context: PathContext,
  session: OpenSession,
  input: RoundInput,
): Promise<Drive> {
  const log = emptyLog()
  const stopped = (step: Readonly<{ stop: DriveStage; label: string }>): Drive => ({
    kind: 'stopped',
    stage: step.stop,
    observation: refused(step.label),
    log,
  })
  const accepted = await acceptInput(context, session, input)
  if ('stop' in accepted) return stopped(accepted)
  const agent = await agentOf(context, session, input)
  const started = await startRun(context, session, agent, input.round)
  if ('stop' in started) return stopped(started)
  session.rounds.open(started.ok.started.execution, { sessionInput: accepted.ok, written: 0, log })
  const invoked = await invokeAgent(context, session, agent, started.ok)
  if ('stop' in invoked) return stopped(invoked)
  const handedOver = await handOver(
    context.assembly,
    session.scene,
    started.ok.started,
    accepted.ok,
  )
  log.handedOver = handedOver.handedOver
  if (input.scenario !== 'held')
    log.waited = await waitTurns(context.turns, () => log.reply !== null || log.failures.length > 0)
  const fixed = started.ok.started.first === accepted.ok
  return {
    kind: 'driven',
    observation: handOverObservation(fixed, log, handedOver),
    stop: drivenStop(fixed, log, handedOver, context.turns),
    agent,
    execution: started.ok.execution,
    run: started.ok.started.advance.run,
    handle: invoked.ok,
    log,
  }
}

/** The Session-side hand-over of a round's input: whether Session holds it, and its label. */
type HandOver = Readonly<{ handedOver: boolean; evidence: string }>

const NOT_ADMITTED = 'agent:message hand-over did not admit the external input'
const OTHER_INPUT = 'session-contract:commit(startRun) fixed another input'

/**
 * H04 of a round: Session fixed this input, the Agent admitted it, and Session holds the hand-over.
 * Session refusing the hand-over with a named failure is a refusal; any other unmet condition
 * disconnects the hop.
 */
function handOverObservation(
  fixed: boolean,
  log: BridgeLog,
  handedOver: HandOver,
): ConnectedObservation {
  const admitted = log.admitted > 0
  const evidence = [
    'public-contract:send-input request read with the wire session',
    'session-contract:commit(accept ordinary) committed the request',
    fixed ? 'session-contract:commit(startRun) fixed the request and opened the Run' : OTHER_INPUT,
    'agent:runtime.invoke accepted the Session execution and input',
    admitted ? 'agent:message hand-over admitted the external input' : NOT_ADMITTED,
    handedOver.evidence,
  ]
  if (!handedOver.handedOver) return { kind: 'refused', evidence }
  return observed(fixed && admitted, evidence)
}

/** The step where a driven round stopped short of a reply, or null when the Agent replied. */
function drivenStop(
  fixed: boolean,
  log: BridgeLog,
  handedOver: HandOver,
  turns: number,
): string | null {
  if (!handedOver.handedOver) return handedOver.evidence
  if (!fixed) return OTHER_INPUT
  if (log.admitted === 0) return NOT_ADMITTED
  if (log.reply !== null) return null
  const failure = log.failures[0]
  if (failure !== undefined) return `bridge:${failure}`
  return log.waited === 'timed-out'
    ? `agent:no reply within ${turns} event-loop turns`
    : 'agent:no reply handed over'
}

/** The step where a round stopped: the refused step, or where the driven round stopped short. */
function stopOf(drive: Drive): string {
  return drive.kind === 'stopped' ? firstLabel(drive.observation) : (drive.stop ?? 'unknown')
}

/**
 * The Session-side hand-over of the input once the Agent accepted the invoke, committed as the
 * drive adapter of the Session coordinator would (GAP-SESSION-COORDINATOR). On the Session log of
 * #756 the Agent loop may take the input before this commit lands; the log then already holds the
 * interpretation of that step (`run.batch-taken`, AD-02) and a second hand-over is `invalid`.
 */
async function handOver(
  assembly: SessionAssembly,
  scene: SessionScene,
  started: StartedRun,
  sessionInput: InputId,
): Promise<HandOver> {
  const committed = await scene.commit<'receive'>({
    kind: 'receive',
    input: {
      tenant: scene.access.tenant,
      session: scene.access.session,
      operation: callerOperation(`handover-${sessionInput}`),
      fact: {
        kind: 'input-handover',
        execution: started.execution,
        input: sessionInput,
        result: { kind: 'accepted', receipt: evidence(`agent/accepted/${String(sessionInput)}`) },
      },
    },
  })
  if (!('failure' in committed))
    return {
      handedOver: true,
      evidence:
        'session-contract:commit(receive input-handover) committed after the Agent accepted the invoke',
    }
  if (
    assembly.agentJournal !== null &&
    inputNoLongerPending(committed.failure) &&
    (await takenOnLog(scene, started.advance.run))
  )
    return {
      handedOver: true,
      evidence:
        'session-adapters:the Agent took the input before the hand-over commit; the Session log holds run.batch-taken for the execution (AD-02)',
    }
  return {
    handedOver: false,
    evidence: `session-contract:commit(receive input-handover) ${committed.failure.kind}`,
  }
}

/**
 * Whether Session refused the hand-over because the input is no longer pending: `invalid` on the
 * field `fact.input`. Any other refusal stays a refusal of the hand-over.
 */
function inputNoLongerPending(failure: SessionFailure): boolean {
  return failure.kind === 'invalid' && failure.field === 'fact.input'
}

/** Whether the Session log holds the batch-taken interpretation of the Run. */
async function takenOnLog(scene: SessionScene, run: RunId): Promise<boolean> {
  const page = await scene.history()
  return page.entries.some(
    entry => entry.kind === 'run.batch-taken' && stringField(entry.payload, 'run') === String(run),
  )
}

// ---------------------------------------------------------------------------------------------
// H05, H06 and H07: what the Agent journal and the bridges observed

type AgentSnapshot = Extract<
  Awaited<ReturnType<AgentJournal<PathPrincipal>['load']>>,
  { ok: unknown }
>['ok']
type JournalEntry = NonNullable<AgentSnapshot['entries']>[number]
type ReceivedModelResult = Extract<JournalEntry, { kind: 'received' }>

async function loadSnapshot(
  agent: Pick<PathAgent, 'journal'>,
  access: Access<PathPrincipal>,
  execution: AgentExecutionId,
): Promise<AgentSnapshot | null> {
  const loaded = await agent.journal.load({ ...access, execution })
  return 'ok' in loaded ? loaded.ok : null
}

/** The received Model result entry of a snapshot, if the journal holds one. */
function receivedModelResult(snapshot: AgentSnapshot | null): ReceivedModelResult | null {
  const entries = snapshot?.entries ?? []
  for (const entry of entries)
    if (
      entry.kind === 'received' &&
      entry.delivery.producer === 'model' &&
      entry.delivery.key.kind === 'result'
    )
      return entry
  return null
}

/** What H05 to H07 read from the Agent journal, its materials and the bridge log of the round. */
type AgentFacts = Readonly<{
  snapshot: AgentSnapshot | null
  log: BridgeLog
  admitted: number
  modelResult: ReceivedModelResult | null
  materialReadable: boolean
  /** The Model call that the received result names, under its original binding. */
  originalCall: string | null
}>

async function agentFacts(
  agent: Pick<PathAgent, 'journal' | 'materials' | 'admitted'>,
  access: Access<PathPrincipal>,
  execution: AgentExecutionId,
  log: BridgeLog,
): Promise<AgentFacts> {
  const snapshot = await loadSnapshot(agent, access, execution)
  const modelResult = receivedModelResult(snapshot)
  const facts = { snapshot, log, admitted: agent.admitted(), modelResult }
  if (modelResult === null || modelResult.delivery.producer !== 'model')
    return { ...facts, materialReadable: false, originalCall: null }
  const { material, ...expected } = modelResult
  const read = await agent.materials.read({ ...access, source: material })
  const ref = resolveModelInvocationRef(modelResult.delivery.key.reference, access.tenant)
  return {
    ...facts,
    materialReadable: 'ok' in read && readModelDeliveryMaterial(access, read.ok, expected) !== null,
    originalCall: 'ok' in ref ? ref.ok.call : null,
  }
}

function leaseLabel(log: BridgeLog): string {
  return log.lease === null
    ? 'caller-reported: no Request Context lease counts'
    : `caller-reported: Request Context lease counts acquired=${log.lease.acquired}, planned=${log.lease.planned}, outstanding=${log.lease.outstanding}`
}

/** Whether Request Context acquired a Model preparation lease, planned with it and released it. */
function leased(log: BridgeLog): boolean {
  return (
    log.lease !== null &&
    log.lease.acquired > 0 &&
    log.lease.outstanding === 0 &&
    log.lease.planned > 0
  )
}

/** Whether the journal binds the Model call of the step: a pending call or a received result. */
function bindsModelCall(facts: AgentFacts): boolean {
  return (
    facts.modelResult !== null ||
    (facts.snapshot?.checkpoint.calls.some(call => call.kind === 'model') ?? false)
  )
}

/** H05: the Agent assembled through Request Context and sent the Model call. */
function observeRequest(facts: AgentFacts): ConnectedObservation {
  const { log } = facts
  const bound = bindsModelCall(facts)
  return observed(
    log.assembled > 0 &&
      log.historyMessages > 0 &&
      leased(log) &&
      log.fixedMessages > 0 &&
      bound &&
      facts.admitted > 0,
    [
      `request-context-contract:assemble produced the Agent request from ${log.historyMessages} Session history message(s)`,
      leaseLabel(log),
      `agent:prepare fixed the request with ${log.fixedMessages} assembled message(s)`,
      bound ? 'agent:journal binds the Model call of the step' : 'agent:journal has no Model call',
      `caller-reported: Model admissions ${facts.admitted}`,
    ],
  )
}

/** H06: the pushed result became the received entry, and the loop continued from it. */
function observeReceipt(facts: AgentFacts): ConnectedObservation {
  const sameCall = facts.originalCall !== null && facts.originalCall === facts.log.reply?.call
  // The ACK deviation is a fact of a delivered result only; without one there is no ACK to account.
  const deviation =
    facts.modelResult === null
      ? []
      : [
          'deviation:MODEL-ACK-ARRIVAL: the Model takes its ACK through the pusher after saved; the Session-side accounting of that ACK stays open (M2)',
        ]
  return observed(facts.modelResult !== null && facts.materialReadable && sameCall, [
    facts.modelResult === null
      ? 'agent:journal has no received Model result'
      : 'model-contract:the public pusher delivered the result to the host receiver, which wrote the received entry and its material',
    sameCall
      ? 'agent:loop continued from the received entry and handed over the reply of the same Model call'
      : 'agent:no reply of the journal Model call',
    ...deviation,
  ])
}

/** H07: the Agent reply entered the Session journal and the execution ended. */
function observeReply(facts: AgentFacts, turns: number): ConnectedObservation {
  const state = facts.snapshot?.state.kind ?? 'unread'
  const waited =
    facts.log.waited === 'timed-out' ? [`agent:no reply within ${turns} event-loop turns`] : []
  return observed(facts.log.reply !== null && state === 'ended', [
    facts.log.reply === null
      ? 'session-contract:commit(recordMessage) not reached'
      : 'session-contract:commit(recordMessage participation message) committed the Agent reply',
    `agent:journal state ${state}`,
    ...waited,
  ])
}

// ---------------------------------------------------------------------------------------------
// H08: the history, read through `read-history`

/** H08: the history, read through `read-history`, returns the assistant replies of the rounds. */
async function readReplies(
  scene: SessionScene,
  identified: Identified,
  replies: readonly string[],
): Promise<ConnectedObservation> {
  const messageId = `cs-history-${String(scene.access.session)}`
  const request = carrySessionRequest({
    protocolVersion: SESSION_VERSION,
    messageId,
    operation: 'read-history',
    proof: proofOf(identified),
    body: {
      tenant: identified.tenant,
      session: wireSessionOf(scene.access.session),
      cursor: null,
      direction: 'forward',
      pageBytes: String(HISTORY_PAGE_BYTES),
    },
  })
  if (request === null || request.operation !== 'read-history')
    return refused('session-read-history-request-not-read')
  const page = await scene.history(DISCLOSED_HISTORY_KINDS)
  const response = carrySessionResponse(
    {
      operation: 'read-history',
      response: {
        protocolVersion: SESSION_VERSION,
        messageId,
        outcome: 'succeeded',
        body: {
          entries: page.entries.map((entry): SessionHistoryEntry => ({
            entryId: String(entry.id),
            revision: String(entry.revision),
            kind: entry.kind,
            payload: entry.payload,
          })),
          next: page.next,
          exhausted: page.exhausted,
          scannedThrough: page.scannedThrough,
        },
      },
      limits: PATH_CODEC_LIMITS,
    },
    messageId,
  )
  if (response === null || response.outcome !== 'succeeded')
    return refused('session-read-history-response-not-read')
  const texts = response.body.entries
    .filter(entry => entry.kind === 'message.assistant')
    .flatMap(entry => {
      const message = messageOf(entry)
      return message === null ? [] : [textOf(message)]
    })
  const found =
    replies.length > 0 &&
    texts.length === replies.length &&
    texts.every((text, index) => text === replies[index])
  return observed(found, [
    'public-contract:read-history request and response read with the wire session',
    `session-contract:history.begin kinds ${page.entries.map(entry => entry.kind).join(',')}`,
    found
      ? `session-contract:history returns ${replies.length} assistant message(s) with the Model reply text, in round order`
      : 'session-contract:history has no assistant message with the Model reply text',
  ])
}

// ---------------------------------------------------------------------------------------------
// H13: the Agent records of the round, read from the Session log

async function readSessionLogRecords(
  { assembly }: PathContext,
  session: OpenSession,
  drive: DrivenRound,
): Promise<ConnectedObservation> {
  const { scene, journal } = session
  if (journal === null)
    return disconnected(
      'agent-journal:this store keeps the Agent Journal outside the Session log, so it does not probe H13 (GAP-SESSION-LOG-TARGETS)',
    )
  const snapshot = await loadSnapshot(journal, scene.access, drive.execution)
  const work = await assembly.transactions.readWork(scene.access)
  const sameExecution = 'ok' in work && runOfDrive(work.ok.run, drive)
  const page = await scene.history()
  const handedOver = page.entries.some(entry => handOverOfDrive(entry, drive))
  return observed(snapshot !== null && sameExecution && handedOver, [
    snapshot === null
      ? 'session-adapters:journal.load on the Session log has no execution'
      : `session-adapters:journal.load on the Session log returns the execution opened under the Run grant, at ${snapshot.checkpoint.position} with ${snapshot.entries?.length ?? 0} received entr(ies)`,
    sameExecution
      ? 'session-contract:readWork binds the Run to the same execution'
      : 'session-contract:readWork binds the Run to another execution',
    handedOver
      ? 'session-contract:history carries the hand-over or batch-taken entry of the execution'
      : 'session-contract:history carries neither the hand-over nor the batch-taken entry',
  ])
}

type WorkRun = Extract<
  Awaited<ReturnType<SessionTransactionPort<PathPrincipal>['readWork']>>,
  { ok: unknown }
>['ok']['run']

/** Whether the Run that Session reports is the Run of the drive: by execution, or by its terminal. */
function runOfDrive(run: WorkRun, drive: DrivenRound): boolean {
  if (run.kind === 'active') return run.execution.execution === String(drive.execution)
  return run.kind === 'terminal' && run.terminal.run === drive.run
}

/** Whether a history entry is the hand-over of the drive's input or the batch-taken of its Run. */
function handOverOfDrive(entry: HistoryEntry, drive: DrivenRound): boolean {
  if (entry.kind === 'intake.handed-over')
    return stringField(entry.payload, 'execution') === String(drive.execution)
  return entry.kind === 'run.batch-taken' && stringField(entry.payload, 'run') === String(drive.run)
}

// ---------------------------------------------------------------------------------------------
// H09: the later rounds of the main session

type LaterRounds = Readonly<{ observation: ConnectedObservation; replies: readonly string[] }>

async function driveLaterRounds(
  context: PathContext,
  session: OpenSession,
  first: DrivenRound,
): Promise<LaterRounds> {
  const replies: string[] = first.log.reply === null ? [] : [first.log.reply.text]
  const messages = context.deps.requests.slice(1, PATH_ROUNDS)
  if (messages.length < PATH_ROUNDS - 1)
    return {
      observation: disconnected(`path:fewer than ${PATH_ROUNDS} requests supplied`),
      replies,
    }
  const lines: string[] = []
  let stopped: 'refused' | 'disconnected' | null = null
  for (const [index, message] of messages.entries()) {
    const round = index + 2
    const drive = await driveRound(context, session, {
      round,
      message,
      scenario: 'reply',
      instance: first.agent.instance,
      existing: first.agent,
    })
    const reply = drive.observation.kind === 'connected' ? drive.log.reply : null
    if (reply === null) {
      stopped = unconnectedKind(drive.observation)
      lines.push(...(await laterRoundStop(context, first, drive, round, message)))
      break
    }
    replies.push(reply.text)
    lines.push(`round ${round}: Run started, Agent replied, reply recorded`)
  }
  const evidenceLines = [
    `session-contract:${replies.length} of ${PATH_ROUNDS} rounds replied`,
    ...lines,
  ]
  const kind = replies.length === PATH_ROUNDS ? 'connected' : (stopped ?? 'disconnected')
  return { observation: { kind, evidence: evidenceLines }, replies }
}

/**
 * Where a later round stopped. The Run of the earlier round has no completed terminal on this path,
 * so the next Run cannot start; the other route, a submit to the first execution, is then probed.
 */
async function laterRoundStop(
  context: PathContext,
  first: DrivenRound,
  drive: Drive,
  round: number,
  message: Message,
): Promise<readonly string[]> {
  const stop = `round ${round}: ${stopOf(drive)}`
  if (drive.kind !== 'stopped' || drive.stage !== 'startRun') return [stop]
  return [stop, `round ${round}: ${await submitToFirst(context, first, round, message)}`]
}

async function submitToFirst(
  { identified }: PathContext,
  first: DrivenRound,
  round: number,
  message: Message,
): Promise<string> {
  const operation = decodeAgentOperationId(`submit-round-${round}`)
  const input = decodeAgentInputId(`input-cs-${round}`)
  if ('failure' in operation || 'failure' in input)
    return 'path:the submit identities are not Agent identities'
  const submitted = await first.handle.input.submit({
    principal: identified.principal,
    tenant: identified.tenant,
    execution: first.execution,
    operation: operation.ok,
    value: { id: input.ok, content: message, source: null, priority: 'ordinary' },
  })
  return 'failure' in submitted
    ? `agent:input.submit ${kindOf(submitted.failure)}`
    : 'agent:input.submit accepted'
}

// ---------------------------------------------------------------------------------------------
// H10, H11, H12: the probes, each in its own session

type Probe = Readonly<{
  name: string
  session: SessionId
  instance: string
  scenario: AgentScenario
}>
const TOOL_PROBE: Probe = {
  name: 'tool',
  session: pathSession(PATH_SESSIONS.tool),
  instance: 'instance-cs-tool',
  scenario: 'tool-call',
}
const REASSEMBLY_PROBE: Probe = {
  name: 'reassembly',
  session: pathSession(PATH_SESSIONS.reassembly),
  instance: 'instance-cs-reassembly',
  scenario: 'held',
}
const REASONING_PROBE: Probe = {
  name: 'reasoning',
  session: pathSession(PATH_SESSIONS.reasoning),
  instance: 'instance-cs-reasoning',
  scenario: 'reasoning',
}

type OpenedProbe = Readonly<{ session: OpenSession; drive: DrivenRound }>

/** Opens the session of a probe and drives its first round; the observation says where it stopped. */
async function openProbe(
  context: PathContext,
  probe: Probe,
): Promise<Readonly<{ opened: OpenedProbe }> | Readonly<{ observation: ConnectedObservation }>> {
  // The probe keeps the kind of the step that stopped it and names that step.
  const label = (kind: 'refused' | 'disconnected', step: string) => ({
    observation: { kind, evidence: [`probe-${probe.name}:${step}`] },
  })
  const opened = await openSession(context, probe.session)
  if (opened.session === null)
    return label(unconnectedKind(opened.observation), firstLabel(opened.observation))
  const message = context.deps.requests[0]
  if (message === undefined) return label('disconnected', 'no request')
  const drive = await driveRound(context, opened.session, {
    round: 1,
    message,
    scenario: probe.scenario,
    instance: probe.instance,
    existing: null,
  })
  if (drive.kind !== 'driven' || drive.observation.kind !== 'connected')
    return label(unconnectedKind(drive.observation), stopOf(drive))
  return { opened: { session: opened.session, drive } }
}

/** A probe observation: connected, refused where the path met the named refusal, else disconnected. */
function probeObservation(
  connected: boolean,
  refusal: boolean,
  evidence: readonly string[],
): ConnectedObservation {
  return { kind: connected ? 'connected' : refusal ? 'refused' : 'disconnected', evidence }
}

/** The journal state and position of a snapshot, as one evidence label. */
function stateLabel(snapshot: AgentSnapshot | null): string {
  return snapshot === null
    ? 'agent:journal unread'
    : `agent:journal state ${snapshot.state.kind} at ${snapshot.checkpoint.position}`
}

/** Whether the loop stopped at I4, the step that refuses a reply with tool calls until #502 stage 2. */
function atToolRefusal(snapshot: AgentSnapshot | null): boolean {
  return snapshot?.state.kind === 'advancing' && snapshot.checkpoint.position === 'I4'
}

/** The facility calls of card #790 item 2: a file read, a file write and one command. */
const TOOL_EFFECTS = ['files.read:done', 'files.write:done', 'command.start:done'] as const

/**
 * The H10 criterion: the Tool ran in the execution environment, the Model was called again with
 * the tool result, and the execution ended.
 */
function toolRoundTripClosed(
  agent: PathAgent,
  toolResult: boolean,
  snapshot: AgentSnapshot | null,
): boolean {
  const effects = agent.toolEffects()
  // Every condition is evaluated; the criterion holds only when all of them hold.
  const conditions = [
    agent.toolInvocations() > 0,
    TOOL_EFFECTS.every(effect => effects.includes(effect)),
    agent.admitted() >= 2,
    toolResult,
    snapshot?.state.kind === 'ended',
  ]
  return conditions.every(Boolean)
}

/**
 * H10: the Model requests a tool; the Agent runs it in the execution environment and calls the
 * Model again with the result. The probe waits for the tool-call reply, then for the reply after
 * the tool result unless the loop already stopped at I4.
 */
async function probeToolRoundTrip(context: PathContext): Promise<ConnectedObservation> {
  const probe = await openProbe(context, TOOL_PROBE)
  if ('observation' in probe) return probe.observation
  const { session, drive } = probe.opened
  const { agent } = drive
  const { snapshot, waits } = await awaitToolRound(context, session, drive)
  // The refusal at I4 is judged from the last snapshot that the probe read.
  const refused = atToolRefusal(snapshot)
  const effects = agent.toolEffects()
  const toolResult = drive.log.requestBlocks.has('tool_result')
  return probeObservation(toolRoundTripClosed(agent, toolResult, snapshot), refused, [
    drive.log.reply === null
      ? 'agent:the tool-call reply was not handed over'
      : 'agent:the tool-call reply was admitted and handed over to Session',
    ...waits,
    `caller-reported: Tool runtime invocations ${agent.toolInvocations()}, execution-environment effects ${effects.join(',') || 'none'}, Model admissions ${agent.admitted()}`,
    stateLabel(snapshot),
    ...(refused ? ['agent:the loop stopped at I4 with the tool-call reply (GAP-TOOL-LOOP)'] : []),
    toolResult
      ? 'agent:a later Model request carried the tool result'
      : 'agent:no Model request carried a tool result',
  ])
}

/** The label of a wait that ended at its bound; nothing when the wait ended in time. */
function timedOut(waited: BridgeLog['waited'], label: string): readonly string[] {
  return waited === 'timed-out' ? [label] : []
}

/**
 * The waits of the tool probe: for the tool-call reply, then, unless the loop stopped at I4, for
 * the reply after the tool result. Returns the last snapshot it read and the waits that timed out.
 */
async function awaitToolRound(
  context: PathContext,
  session: OpenSession,
  drive: DrivenRound,
): Promise<Readonly<{ snapshot: AgentSnapshot | null; waits: readonly string[] }>> {
  const load = () => loadSnapshot(drive.agent, session.scene.access, drive.execution)
  const turns = context.turns
  const first = drive.log.waited
  const waits = timedOut(first, `agent:no tool-call reply within ${turns} event-loop turns`)
  const snapshot = await load()
  if (atToolRefusal(snapshot)) return { snapshot, waits }
  const second = await waitTurns(turns, () => drive.log.replies >= 2)
  return {
    snapshot: await load(),
    waits: [
      ...waits,
      ...timedOut(second, `agent:no second reply within ${turns} event-loop turns`),
    ],
  }
}

const replyLabel = (name: string, reply: { ok: unknown } | { failure: unknown } | null) =>
  reply === null
    ? `agent:${name} not reached`
    : 'failure' in reply
      ? `agent:${name} ${kindOf(reply.failure)}`
      : `agent:${name} succeeded`

type Withdrawal = Readonly<{
  quiesced: { ok: unknown } | { failure: unknown }
  detached: { ok: unknown } | { failure: unknown } | null
  resumed: { ok: unknown } | { failure: unknown }
}>

/** Withdraws the instance of a drive and resumes its execution through the public Agent faces. */
async function withdrawAndResume(
  context: PathContext,
  session: OpenSession,
  drive: DrivenRound,
): Promise<Withdrawal> {
  const { agent, execution } = drive
  const access = { principal: context.identified.principal, tenant: context.identified.tenant }
  const before = await loadSnapshot(agent, session.scene.access, execution)
  const reason = evidence('reassembly/withdraw')
  const quiesced = await agent.provider.control.quiesce({
    ...access,
    operation: QUIESCE_OPERATION,
    reason,
  })
  const authority = before?.executionAttachment ?? null
  const detached =
    authority === null
      ? null
      : await agent.provider.recovery.detach({
          ...access,
          execution,
          operation: DETACH_OPERATION,
          authority,
          reason,
        })
  const resumed = await agent.provider.runtime.resume({
    ...access,
    execution,
    operation: RESUME_OPERATION,
    recovery: reason,
    grant: null,
  })
  return { quiesced, detached, resumed }
}

/**
 * The observation continuity of H11 (card #790 item 3, E4 of the H3 ruling): after reassembly the
 * frames on the same observation connection keep a continuous sequence, through the observation
 * path of the server entry. No public entry supplies that path on this track, so the probe cannot
 * observe it, and H11 does not connect without it (GAP-AGENT-REASSEMBLY).
 */
const OBSERVATION_CONTINUITY = {
  observed: false,
  label:
    'observation:no public entry supplies the server-entry observation path; frame continuity on the observation connection after reassembly is not observed (GAP-AGENT-REASSEMBLY)',
} as const

/** How the execution of the reassembly probe ended, as observed after the Model settled. */
function reassemblyEnd(withdrawn: boolean, after: AgentSnapshot | null): string {
  if (after?.state.kind !== 'ended') return `${stateLabel(after)} after the Model settled`
  return withdrawn
    ? 'agent:the resumed execution ended from the received entry after the Model settled'
    : 'agent:the original driver continued from the received entry after the Model settled'
}

/**
 * H11: the Agent instance is withdrawn during a Model call and assembled again. Connected only
 * when the withdrawal and the resume succeeded, the Model admitted the call once (no re-send), the
 * execution ended from the Journal, and the observation stayed continuous.
 */
async function probeReassembly(context: PathContext): Promise<ConnectedObservation> {
  const probe = await openProbe(context, REASSEMBLY_PROBE)
  if ('observation' in probe) return probe.observation
  const { session, drive } = probe.opened
  const { agent } = drive
  const turns = context.turns
  // Wait until the Model call is admitted and the loop waits for its result.
  const admittedWait = await waitTurns(turns, () => agent.admitted() > 0)
  let withdrawal: Withdrawal
  try {
    withdrawal = await withdrawAndResume(context, session, drive)
  } finally {
    agent.releaseModel?.()
  }
  const replyWait = await waitTurns(turns, () => drive.log.reply !== null)
  const after = await loadSnapshot(agent, session.scene.access, drive.execution)
  const { quiesced, detached, resumed } = withdrawal
  const withdrawn = 'ok' in quiesced && 'ok' in resumed
  const admissions = agent.admitted()
  const criterion = [
    withdrawn,
    admissions === 1,
    after?.state.kind === 'ended',
    OBSERVATION_CONTINUITY.observed,
  ]
  return probeObservation(criterion.every(Boolean), !withdrawn, [
    `caller-reported: Model admissions ${admissions} after the Model settled`,
    ...timedOut(admittedWait, `agent:the Model admitted no call within ${turns} event-loop turns`),
    replyLabel('control.quiesce', quiesced),
    replyLabel('recovery.detach', detached),
    replyLabel('runtime.resume', resumed),
    ...timedOut(
      replyWait,
      `agent:no reply within ${turns} event-loop turns after the Model was released`,
    ),
    reassemblyEnd(withdrawn, after),
    OBSERVATION_CONTINUITY.label,
  ])
}

/**
 * H12: the first reply carries reasoning; the next request must replay it. When the loop hands
 * over the first reply, the probe drives the second round on the same Agent and checks that its
 * request carries the reasoning part again.
 */
async function probeReasoningReplay(context: PathContext): Promise<ConnectedObservation> {
  const probe = await openProbe(context, REASONING_PROBE)
  if ('observation' in probe) return probe.observation
  const { session, drive } = probe.opened
  const waited = drive.log.waited
  const snapshot = await loadSnapshot(drive.agent, session.scene.access, drive.execution)
  const received = receivedModelResult(snapshot) !== null
  const head = [
    received
      ? 'model-contract:the public pusher delivered the reasoning result to the host receiver'
      : 'agent:journal has no received Model result',
    stateLabel(snapshot),
    ...timedOut(waited, `agent:no reply within ${context.turns} event-loop turns`),
  ]
  if (drive.log.reply === null) {
    const held =
      received && snapshot?.state.kind === 'waiting' && snapshot.checkpoint.position === 'M6'
    const hold = held
      ? [
          'agent:the loop holds the received result with reasoning parts at M6 and handed over no reply (GAP-REASONING-REPLAY)',
        ]
      : []
    return probeObservation(false, held, [...head, ...hold, 'agent:no second request was sent'])
  }
  const replay = await replayRound(context, session, drive)
  return probeObservation(replay.replayed, false, [
    ...head,
    'agent:the reasoning reply was handed over',
    replay.label,
  ])
}

/** The second round of the reasoning probe, and whether its request replays the reasoning part. */
async function replayRound(
  context: PathContext,
  session: OpenSession,
  first: DrivenRound,
): Promise<Readonly<{ replayed: boolean; label: string }>> {
  const message = context.deps.requests[1]
  if (message === undefined) return { replayed: false, label: 'path:no second request supplied' }
  const second = await driveRound(context, session, {
    round: 2,
    message,
    scenario: 'reasoning',
    instance: first.agent.instance,
    existing: first.agent,
  })
  if (second.kind !== 'driven') return { replayed: false, label: `round 2: ${stopOf(second)}` }
  const replayed = second.log.requestBlocks.has('thinking')
  return {
    replayed,
    label: replayed
      ? 'agent:the second request replays the reasoning part'
      : 'agent:the second request does not carry the reasoning part',
  }
}

// ---------------------------------------------------------------------------------------------
// The path

type MainSession = Readonly<{ context: PathContext; session: OpenSession }>

/** H01 to H03: the tenant, the login, and the main session with the injected access check. */
async function openMainSession(
  deps: PathDependencies,
  result: Partial<Record<FirstPathHop, ConnectedObservation>>,
): Promise<MainSession | null> {
  const registered = await registerTenant(deps)
  result.H01 = registered.observation
  if (registered.tenant === null || registered.observation.kind !== 'connected') return null
  const login = await logIn(deps, registered.tenant)
  result.H02 = login.observation
  if (login.identified === null) return null
  // #680 B-1 item 4: the Session store derives Session participation from the Agent Journal, so
  // the access check is a required injection. Without it the assembly stays pending.
  const accessCheck = deps.sessionAccessCheck
  if (accessCheck === undefined) {
    result.H03 = disconnected('session-assembly:pending:sessionAccessCheck')
    return null
  }
  const context: PathContext = {
    deps,
    assembly: deps.session({ accessCheck }),
    identified: login.identified,
    turns: deps.replyTurns ?? DEFAULT_REPLY_TURNS,
  }
  const opened = await openSession(context, pathSession(PATH_SESSIONS.main))
  result.H03 = opened.observation
  return opened.session === null ? null : { context, session: opened.session }
}

/** H04 to H07: the first round, and what the Agent journal and the bridges observed of it. */
async function driveFirstRound(
  { context, session }: MainSession,
  result: Partial<Record<FirstPathHop, ConnectedObservation>>,
): Promise<DrivenRound | null> {
  const first = context.deps.requests[0]
  if (first === undefined) {
    result.H04 = disconnected('path:no request supplied')
    return null
  }
  const drive = await driveRound(context, session, {
    round: 1,
    message: first,
    scenario: 'reply',
    instance: 'instance-cs-1',
    existing: null,
  })
  result.H04 = drive.observation
  // A first round that did not hand the input over stops the path (SPEC「Path」).
  if (drive.kind !== 'driven' || drive.observation.kind !== 'connected') return null
  const access = { principal: context.identified.principal, tenant: context.identified.tenant }
  const facts = await agentFacts(drive.agent, access, drive.execution, drive.log)
  result.H05 = observeRequest(facts)
  result.H06 = observeReceipt(facts)
  result.H07 = observeReply(facts, context.turns)
  return drive
}

export async function runFirstTenantPath(deps: PathDependencies): Promise<FirstPathObservation> {
  const result: Partial<Record<FirstPathHop, ConnectedObservation>> = {}
  const main = await openMainSession(deps, result)
  if (main === null) return result
  const drive = await driveFirstRound(main, result)
  if (drive === null) return result
  result.H13 = await readSessionLogRecords(main.context, main.session, drive)
  const later = await driveLaterRounds(main.context, main.session, drive)
  result.H09 = later.observation
  result.H08 = await readReplies(main.session.scene, main.context.identified, later.replies)
  const bridgeFailures = drive.log.failures.map(failure => `bridge:${failure}`)
  for (const hop of ['H04', 'H05', 'H06', 'H07'] as const)
    result[hop] = withEvidence(result[hop] ?? NOT_REACHED, bridgeFailures)
  if (result.H07?.kind !== 'connected') return result
  result.H10 = await probeToolRoundTrip(main.context)
  result.H11 = await probeReassembly(main.context)
  result.H12 = await probeReasoningReplay(main.context)
  return result
}
