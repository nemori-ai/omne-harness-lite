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
  type AgentJournal,
  type AgentMaterials,
  type Access,
  type DurableEvidence as AgentEvidence,
  type MessageHandoff,
  type RequestPreparation,
} from '@omne-harness/agent-contract'
import type { IdentityOperations } from '@omne-harness/identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import { readJsonText, writeJsonText } from '@omne-harness/json-text'
import type { AssemblyResult } from '@omne-harness/request-context-contract'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  type CommitReceipt,
  type DurableEvidence,
  type EntryId,
  type HistoryEntry,
  type HistoryPage,
  type InputId,
  type MutationName,
  type SessionAccess,
  type SessionAccessCheck,
  type SessionCommand,
  type SessionManagement,
  type SessionReconciliation,
  type SessionWork,
  type SessionCreation,
  type SessionEvidenceBridge,
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
} from '@omne-harness/public-contract'
import { GOVERNANCE_LIMITS } from './governance.ts'

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

/** What one connected hop observed. `connected` is true only when the public calls succeeded in order. */
export type ConnectedObservation = Readonly<{
  connected: boolean
  evidence: readonly string[]
}>

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
}>

export type PathDependencies = Readonly<{
  identity: IdentityOperations
  /** The login identifier and credential of the first tenant; they never enter the report. */
  login: Readonly<{ loginIdentifier: string; credential: string }>
  /**
   * The current access decision of every Session read and write. The path hands it to `session`;
   * without it the assembly stays pending and no Session call is made (#680 ruling B-1, item 4).
   */
  sessionAccessCheck: SessionAccessCheck<PathPrincipal>
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
  /** Upper bound on waiting for the Agent reply, in event-loop turns. */
  replyTurns?: number
}>

export type FirstPathHop =
  | 'H01'
  | 'H02'
  | 'H03'
  | 'H04'
  | 'H05'
  | 'H06'
  | 'H07'
  | 'H08'
  | 'H09'
  | 'H10'
  | 'H11'
  | 'H12'
  | 'H13'
export type FirstPathObservation = Readonly<Record<FirstPathHop, ConnectedObservation>>

const none = (reason: string): ConnectedObservation => ({ connected: false, evidence: [reason] })

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

/** A Session operation id minted by the caller for the intake operations of this path. */
const callerOperation = (name: string): SessionOperationId => `sop_cs-${name}` as SessionOperationId

function evidence(record: string): DurableEvidence {
  return { owner: PATH_OWNER, record, revision: '1', digest: `sha256:${record}` }
}

function textOf(message: Message): string {
  return message.blocks
    .map(block => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('')
}

/** The message of a Session message entry, read back from its json-text payload. */
export function messageOf(entry: Pick<HistoryEntry, 'kind' | 'payload'>): Message | null {
  if (!entry.kind.startsWith('message.')) return null
  const plain: unknown = JSON.parse(writeJsonText(entry.payload))
  const candidate =
    typeof plain === 'object' && plain !== null && 'message' in plain
      ? (plain as { message: unknown }).message
      : null
  const judged = judgeMessage(candidate)
  return 'ok' in judged ? judged.ok : null
}

/** Waits at most `turns` event-loop turns for `done` to become true. */
async function waitTurns(turns: number, done: () => boolean): Promise<void> {
  for (let turn = 0; turn < turns && !done(); turn += 1)
    await new Promise(resolve => setTimeout(resolve, 0))
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
        limits: GOVERNANCE_LIMITS,
      }),
    ),
    limits: GOVERNANCE_LIMITS,
  })
  if (request.kind !== 'request' || request.request.operation !== 'register-and-activate')
    return { observation: none('register-request-not-read'), tenant: null }
  const outcome = await deps.identity.registerAndActivate(request.request.body)
  if (outcome.kind !== 'succeeded')
    return { observation: none(`identity-register:${outcome.kind}`), tenant: null }
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
        limits: GOVERNANCE_LIMITS,
      }),
    ),
    operation: 'register-and-activate',
    expectedMessageId: 'cs-register',
    limits: GOVERNANCE_LIMITS,
  })
  if (
    response.kind !== 'response' ||
    response.response.outcome !== 'succeeded' ||
    !('tenantId' in response.response.body)
  )
    return { observation: none('register-response-not-read'), tenant: null }
  const tenant = response.response.body.tenantId
  return {
    observation: {
      connected: tenantEquals(tenant, outcome.tenant),
      evidence: [
        'public-contract:register-and-activate request read',
        'identity:registerAndActivate succeeded',
        'public-contract:register-and-activate response read with the identity tenant',
      ],
    },
    tenant,
  }
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
        limits: GOVERNANCE_LIMITS,
      }),
    ),
    limits: GOVERNANCE_LIMITS,
  })
  if (request.kind !== 'request' || request.request.operation !== 'issue-login')
    return { observation: none('login-request-not-read'), identified: null }
  const issued = await deps.identity.issueLogin(request.request.body)
  if (issued.kind !== 'succeeded')
    return { observation: none(`identity-login:${issued.kind}`), identified: null }
  const response = readGovernanceResponse({
    bytes: encoded(
      encodeGovernanceResponse({
        operation: 'issue-login',
        response: {
          protocolVersion: GOVERNANCE_VERSION,
          messageId: request.request.messageId,
          outcome: 'succeeded',
          body: {
            loginIdentifier: issued.loginIdentifier,
            issuedAt: issued.issuedAt,
            tenantId: issued.tenant,
            loginProof: issued.loginProof,
          },
        },
        limits: GOVERNANCE_LIMITS,
      }),
    ),
    operation: 'issue-login',
    expectedMessageId: 'cs-login',
    limits: GOVERNANCE_LIMITS,
  })
  if (
    response.kind !== 'response' ||
    response.response.outcome !== 'succeeded' ||
    !('loginProof' in response.response.body)
  )
    return { observation: none('login-response-not-read'), identified: null }
  const loginProof = response.response.body.loginProof
  const recognized = await deps.identity.recognizeLogin({ loginProof })
  if (recognized.kind !== 'recognized')
    return { observation: none(`identity-recognize:${recognized.kind}`), identified: null }
  const same = tenantEquals(recognized.tenant, tenant)
  return {
    observation: {
      connected: same,
      evidence: [
        'public-contract:issue-login request read',
        'identity:issueLogin succeeded',
        'public-contract:issue-login response read',
        same
          ? 'identity:recognizeLogin recognized the registered tenant'
          : 'identity:recognizeLogin recognized another tenant',
      ],
    },
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
  const bytes = encodeSessionRequest({ request, limits: GOVERNANCE_LIMITS })
  if (bytes.kind !== 'encoded') return null
  const read = readSessionRequest({ bytes: bytes.bytes, limits: GOVERNANCE_LIMITS })
  if (read.kind !== 'request' || read.request.operation !== request.operation) return null
  return read.request
}

/** Encodes a session response, reads it back, and returns the read response. */
function carrySessionResponse<O extends SessionOperation>(
  operation: O,
  response: SessionResponse<O>,
  expectedMessageId: string,
): SessionResponse<O> | null {
  const bytes = encodeSessionResponse({ operation, response, limits: GOVERNANCE_LIMITS } as never)
  if (bytes.kind !== 'encoded') return null
  const read = readSessionResponse({
    bytes: bytes.bytes,
    operation,
    expectedMessageId,
    limits: GOVERNANCE_LIMITS,
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
          pageBytes: 1_000_000,
        }),
        'history.begin',
      )
    },
  }
}

/** The Session binding of the current round; the bridges read it on every call. */
type Binding = { execution: string | null; sessionInput: InputId | null; written: number }

type BridgeLog = {
  /** External inputs the message hand-over admitted for the Agent. */
  admitted: number
  /** Whether the Session side holds the hand-over of the round's input. */
  handedOver: boolean
  reply: Readonly<{ text: string; call: string; receipt: CommitReceipt }> | null
  assembled: number
  fixed: number
  fixedMessages: number
  historyMessages: number
  lease: Readonly<{ acquired: number; outstanding: number; planned: number }> | null
  failures: string[]
}

/** The round the bridges serve now. A new round replaces both parts before its Run starts. */
type Round = { binding: Binding; log: BridgeLog }

function emptyLog(): BridgeLog {
  return {
    admitted: 0,
    handedOver: false,
    reply: null,
    assembled: 0,
    fixed: 0,
    fixedMessages: 0,
    historyMessages: 0,
    lease: null,
    failures: [],
  }
}

function newRound(): Round {
  return { binding: { execution: null, sessionInput: null, written: 0 }, log: emptyLog() }
}

/** The commit receipt of a mutation result: the result itself or its `receipt` field. */
function receiptOf(value: unknown): CommitReceipt | null {
  if (typeof value !== 'object' || value === null) return null
  if ('receipt' in value) return (value as { receipt: CommitReceipt }).receipt
  return 'source' in value && 'operation' in value ? (value as CommitReceipt) : null
}

/**
 * The Agent message hand-over of this application. The external input is admitted here; the
 * Session-side `receive(input-handover)` is committed by the round driver once the Agent accepted
 * the invoke, as the drive adapter of the Session coordinator would (GAP-SESSION-COORDINATOR). A
 * Model reply is committed to Session as a `message` participation.
 */
function messageBridge(scene: SessionScene, current: () => Round): MessageHandoff<PathPrincipal> {
  const reject = (log: BridgeLog, reason: string) => {
    log.failures.push(reason)
    return {
      ok: { kind: 'rejected' as const, reason, evidence: evidence(`handoff/rejected/${reason}`) },
    }
  }
  return {
    async accept(input) {
      const { binding, log } = current()
      const execution = binding.execution
      const sessionInput = binding.sessionInput
      if (execution === null || sessionInput === null) return reject(log, 'no-session-run')
      if (input.source.kind === 'external-input') {
        if (String(input.source.input) !== String(sessionInput))
          return reject(log, 'external-input:not-the-session-input')
        log.admitted += 1
        return {
          ok: {
            kind: 'accepted',
            admission: evidence(`handoff/admitted/${String(input.source.input)}`) as AgentEvidence,
          },
        }
      }
      if (input.source.kind === 'model-reply') {
        binding.written += 1
        const agentOperation = `agent-${String(input.source.call)}`
        const committed = await scene.commit<'recordMessage'>({
          kind: 'recordMessage',
          input: {
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
              written: String(binding.written),
              handover: evidence(`agent/message/${String(input.operation)}`),
            },
            value: {
              message: input.candidate,
              source: input.source.result.source,
              admission: evidence(`agent/admission/${String(input.operation)}`),
              consumption: null,
            },
          },
        })
        if ('failure' in committed)
          return reject(log, `session-recordMessage:${committed.failure.kind}`)
        const receipt = receiptOf(committed.ok)
        if (receipt === null) return reject(log, 'session-recordMessage:no-receipt')
        log.reply = { text: textOf(input.candidate), call: String(input.source.call), receipt }
        return { ok: { kind: 'accepted', admission: receipt.source as AgentEvidence } }
      }
      return reject(log, `unsupported-source:${input.source.kind}`)
    },
  }
}

function contextBridge(
  scene: SessionScene,
  tenant: TenantId,
  deps: Pick<PathDependencies, 'assemble' | 'preparationFrame'>,
  current: () => Round,
): RequestPreparation<PathPrincipal> {
  const unsupported = async () => ({ failure: { kind: 'unsupported' as const } })
  return {
    async prepare(input) {
      const { log } = current()
      const frame = await deps.preparationFrame(input)
      if ('failure' in frame) return frame
      if (frame.ok.kind !== 'ready') return frame
      const { request, capacity: _capacity, ...common } = frame.ok
      const previous = input.previous
      if (previous !== null) {
        // P1: fix the request from the assembled input of P0, carrying Request Context's content.
        if (previous.kind !== 'assembled') return frame
        // The representation and source adoptions stay the frame's: the Request Context testing
        // policies carry adoption digests that the Model request check refuses (see SPEC H05).
        const { system, messages, tools, toolChoice } = previous.input
        log.fixed += 1
        log.fixedMessages = messages.length
        return {
          ok: { ...frame.ok, request: { ...request, system, messages, tools, toolChoice } },
        }
      }
      const page = await scene.history()
      const history = page.entries.flatMap(entry => {
        const message = messageOf(entry)
        return message === null ? [] : [{ entry: entry.id, message }]
      })
      const { result: assembled, lease } = await deps.assemble({ tenant, history })
      log.lease = lease
      if (
        assembled.kind !== 'candidate-fixable' &&
        assembled.kind !== 'candidate-before-extension'
      ) {
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
    },
    derive: unsupported,
    resume: unsupported,
  }
}

// ---------------------------------------------------------------------------------------------
// H03: the session, created through the public session codec

type SessionStart = Readonly<{
  observation: ConnectedObservation
  scene: SessionScene | null
}>

/** H03: create the session for the recognized tenant and principal through `create-session`. */
async function createSession(
  deps: Pick<PathDependencies, 'creation'>,
  assembly: SessionAssembly,
  identified: Identified,
  session: SessionId,
): Promise<SessionStart> {
  const access: SessionAccess<PathPrincipal> = {
    principal: identified.principal,
    tenant: identified.tenant,
    session,
  }
  const scene = sessionScene(assembly.transactions, assembly.evidence, access)
  const messageId = `cs-create-${String(session)}`
  const request = carrySessionRequest({
    protocolVersion: SESSION_VERSION,
    messageId,
    operation: 'create-session',
    proof: proofOf(identified),
    actingTenant: identified.tenant,
    body: {
      createCallId: `create-${String(session)}`,
      definition: deps.creation.definition.name,
      purpose: deps.creation.purpose,
    },
  })
  if (request === null || request.operation !== 'create-session')
    return { observation: none('session-create-request-not-read'), scene: null }
  if (!tenantEquals(request.actingTenant, identified.tenant))
    return { observation: none('session-create-request-foreign-tenant'), scene: null }
  const created = await scene.commit<'create'>({
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: callerOperation(request.body.createCallId),
      creation: deps.creation,
    },
  })
  if ('failure' in created)
    return { observation: none(`session-create:${created.failure.kind}`), scene: null }
  const response = carrySessionResponse(
    'create-session',
    {
      protocolVersion: SESSION_VERSION,
      messageId,
      outcome: 'succeeded',
      body: { session: wireSessionOf(session), recovered: created.ok.receipt.recovered },
    },
    messageId,
  )
  if (response === null || response.outcome !== 'succeeded')
    return { observation: none('session-create-response-not-read'), scene: null }
  const work = await assembly.transactions.readWork(access)
  const connected =
    'ok' in work && work.ok.session === access.session && response.body.session.length === 64
  return {
    observation: {
      connected,
      evidence: [
        'public-contract:create-session request read with the acting tenant',
        'session-contract:commit(create) committed for the identity tenant',
        'public-contract:create-session response read with the wire session',
        'session-contract:readWork returns the session',
      ],
    },
    scene: connected ? scene : null,
  }
}

// ---------------------------------------------------------------------------------------------
// One round: accept the input through `send-input`, start the Run, invoke the Agent, wait

type Drive = Readonly<{
  observation: ConnectedObservation
  /** Present once the Agent accepted the invoke; the later hops read its journal. */
  agent: PathAgent | null
  execution: AgentExecutionId | null
  handle: AgentExecutionHandle<PathPrincipal> | null
  log: BridgeLog
}>

type RoundBridges = Readonly<{
  current: () => Round
  replace: (round: Round) => void
  handoff: MessageHandoff<PathPrincipal>
  requests: RequestPreparation<PathPrincipal>
}>

function roundBridges(
  scene: SessionScene,
  tenant: TenantId,
  deps: Pick<PathDependencies, 'assemble' | 'preparationFrame'>,
): RoundBridges {
  let round = newRound()
  const current = () => round
  return {
    current,
    replace: next => {
      round = next
    },
    handoff: messageBridge(scene, current),
    requests: contextBridge(scene, tenant, deps, current),
  }
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
): Promise<Readonly<{ handedOver: boolean; evidence: string }>> {
  const execution = started.execution
  const committed = await scene.commit<'receive'>({
    kind: 'receive',
    input: {
      tenant: scene.access.tenant,
      session: scene.access.session,
      operation: callerOperation(`handover-${sessionInput}`),
      fact: {
        kind: 'input-handover',
        execution,
        input: sessionInput,
        result: { kind: 'accepted', receipt: evidence(`agent/accepted/${String(sessionInput)}`) },
      },
    },
  })
  if (!('failure' in committed))
    return {
      handedOver: receiptOf(committed.ok) !== null,
      evidence:
        'session-contract:commit(receive input-handover) committed after the Agent accepted the invoke',
    }
  if (assembly.agentJournal !== null && committed.failure.kind === 'invalid') {
    const taken = await takenOnLog(scene, String(started.advance.run))
    if (taken)
      return {
        handedOver: true,
        evidence:
          'session-adapters:the Agent took the input before the hand-over commit; the Session log holds run.batch-taken for the execution (AD-02)',
      }
  }
  return {
    handedOver: false,
    evidence: `session-contract:commit(receive input-handover) ${committed.failure.kind}`,
  }
}

/** Whether the Session log holds the batch-taken interpretation of the Run. */
async function takenOnLog(scene: SessionScene, run: string): Promise<boolean> {
  const page = await scene.history()
  return page.entries.some(entry => {
    if (entry.kind !== 'run.batch-taken') return false
    const plain: unknown = JSON.parse(writeJsonText(entry.payload))
    return (
      typeof plain === 'object' &&
      plain !== null &&
      'run' in plain &&
      (plain as { run: unknown }).run === run
    )
  })
}

/** The `send-input` carriage of one external input; null when the codec did not carry it. */
function carryInput(
  identified: Identified,
  session: SessionId,
  sessionInput: InputId,
  message: Message,
): Message | null {
  const plain = readJsonText(JSON.stringify(message), GOVERNANCE_LIMITS)
  if (plain.kind !== 'ok' || plain.value.kind !== 'object') return null
  const messageId = `cs-send-${String(sessionInput)}`
  const request = carrySessionRequest({
    protocolVersion: SESSION_VERSION,
    messageId,
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
  const read = judgeMessage(JSON.parse(writeJsonText(request.body.message)))
  return 'ok' in read ? read.ok : null
}

/**
 * One round of the session: the input through `send-input`, the Run, the hand-over to Agent, and
 * the wait for the Agent reply. `existing` reuses the Agent of an earlier round.
 */
async function driveRound(
  deps: PathDependencies,
  assembly: SessionAssembly,
  scene: SessionScene,
  identified: Identified,
  bridges: RoundBridges,
  input: Readonly<{
    round: number
    message: Message
    scenario: AgentScenario
    instance: string
    existing: PathAgent | null
    journal: SessionLogAgentJournal | null
  }>,
): Promise<Drive> {
  const round = newRound()
  bridges.replace(round)
  const { log, binding } = round
  const stop = (reason: string, agent: PathAgent | null = null): Drive => ({
    observation: none(reason),
    agent,
    execution: null,
    handle: null,
    log,
  })
  const base = { tenant: scene.access.tenant, session: scene.access.session }
  const sessionInput = `input-cs-${input.round}` as InputId
  const message = carryInput(identified, scene.access.session, sessionInput, input.message)
  if (message === null) return stop('session-send-input-not-read')
  const accepted = await scene.commit<'accept'>({
    kind: 'accept',
    input: {
      ...base,
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
  if ('failure' in accepted) return stop(`session-accept:${accepted.failure.kind}`)
  binding.sessionInput = sessionInput
  const agent =
    input.existing ??
    (await deps.agent({
      principal: identified.principal,
      tenant: identified.tenant,
      instance: input.instance,
      scenario: input.scenario,
      journal: input.journal,
      handoff: bridges.handoff,
      requests: bridges.requests,
    }))
  const startedOutcome = await scene.commit<'startRun'>({
    kind: 'startRun',
    input: {
      ...base,
      operation: callerOperation(`start-run-${input.round}`),
      entry: 'interactive',
      candidate: deps.creation.definition.candidate,
      instance: { owner: 'agent', id: agent.instance },
    },
  })
  if ('failure' in startedOutcome)
    return stop(`session-startRun:${startedOutcome.failure.kind}`, agent)
  const started = startedOutcome.ok as StartedRun
  binding.execution = started.execution
  const execution = decodeAgentExecutionId(started.execution)
  const agentInput = decodeAgentInputId(String(started.first))
  const agentOperation = decodeAgentOperationId(
    deriveDriveOperation({
      kind: 'invoke',
      execution: started.execution,
      first: started.first,
      started: started.receipt.source,
    }),
  )
  if ('failure' in execution || 'failure' in agentInput || 'failure' in agentOperation)
    return stop('session-execution-or-input-not-an-agent-identity', agent)
  // The Agent receives the input as Session admitted it: its identity, content and origin.
  const admitted = await assembly.transactions.readInput({ ...scene.access, input: started.first })
  if ('failure' in admitted) return stop(`session-readInput:${admitted.failure.kind}`, agent)
  const invoked = await agent.provider.runtime.invoke({
    principal: identified.principal,
    tenant: identified.tenant,
    execution: execution.ok,
    operation: agentOperation.ok,
    initial: {
      id: agentInput.ok,
      content: admitted.ok.message,
      source: admitted.ok.origin as AgentEvidence,
      priority: 'ordinary',
    },
    // A Journal on the Session log checks the grant of the Run; an independent Journal takes none.
    grant: input.journal === null ? null : (started.receipt.source as AgentEvidence),
  })
  if ('failure' in invoked) return stop(`agent-invoke:${kindOf(invoked.failure)}`, agent)
  const handedOver = await handOver(assembly, scene, started, sessionInput)
  log.handedOver = handedOver.handedOver
  const turns = deps.replyTurns ?? 2000
  if (input.scenario !== 'held')
    await waitTurns(turns, () => log.reply !== null || log.failures.length > 0)
  return {
    observation: {
      connected: started.first === sessionInput && log.admitted > 0 && log.handedOver,
      evidence: [
        'public-contract:send-input request read with the wire session',
        'session-contract:commit(accept ordinary) committed the request',
        'session-contract:commit(startRun) fixed the request and opened the Run',
        'agent:runtime.invoke accepted the Session execution and input',
        log.admitted > 0
          ? 'agent:message hand-over admitted the external input'
          : 'agent:message hand-over did not admit the external input',
        handedOver.evidence,
      ],
    },
    agent,
    execution: execution.ok,
    handle: invoked.ok,
    log,
  }
}

type AgentSnapshot = Extract<
  Awaited<ReturnType<AgentJournal<PathPrincipal>['load']>>,
  { ok: unknown }
>['ok']

function leaseLabel(log: BridgeLog): string {
  return log.lease === null
    ? 'caller-reported: no Request Context lease counts'
    : `caller-reported: Request Context lease counts acquired=${log.lease.acquired}, planned=${log.lease.planned}, outstanding=${log.lease.outstanding}`
}

async function loadSnapshot(
  agent: Pick<PathAgent, 'journal'>,
  access: Access<PathPrincipal>,
  execution: AgentExecutionId,
): Promise<AgentSnapshot | null> {
  const loaded = await agent.journal.load({ ...access, execution })
  return 'ok' in loaded ? loaded.ok : null
}

/** H05, H06 and H07: what the Agent journal and the bridges observed. */
async function observeAgent(
  snapshot: AgentSnapshot | null,
  log: BridgeLog,
  agent: Pick<PathAgent, 'materials' | 'admitted'>,
  access: Access<PathPrincipal>,
): Promise<Readonly<Record<'H05' | 'H06' | 'H07', ConnectedObservation>>> {
  const { materials } = agent
  const pendingCall = snapshot?.checkpoint.calls.some(call => call.kind === 'model') ?? false
  const admitted = agent.admitted()
  const modelResult =
    snapshot?.entries?.find(
      entry =>
        entry.kind === 'received' &&
        entry.delivery.producer === 'model' &&
        entry.delivery.key.kind === 'result',
    ) ?? null
  let originalCall: string | null = null
  let materialReadable = false
  if (modelResult?.kind === 'received' && modelResult.delivery.producer === 'model') {
    const { material, ...expected } = modelResult
    const read = await materials.read({ ...access, source: material })
    materialReadable = 'ok' in read && readModelDeliveryMaterial(access, read.ok, expected) !== null
    const ref = resolveModelInvocationRef(modelResult.delivery.key.reference, access.tenant)
    if ('ok' in ref) originalCall = ref.ok.call
  }
  const leased =
    log.lease !== null &&
    log.lease.acquired > 0 &&
    log.lease.outstanding === 0 &&
    log.lease.planned > 0
  const sameCall = originalCall !== null && originalCall === (log.reply?.call ?? null)
  const ended = snapshot?.state.kind === 'ended'
  return {
    H05: {
      connected:
        log.assembled > 0 &&
        log.historyMessages > 0 &&
        leased &&
        log.fixedMessages > 0 &&
        (pendingCall || modelResult !== null) &&
        admitted > 0,
      evidence: [
        `request-context-contract:assemble produced the Agent request from ${log.historyMessages} Session history message(s)`,
        leaseLabel(log),
        `agent:prepare fixed the request with ${log.fixedMessages} assembled message(s)`,
        pendingCall || modelResult !== null
          ? 'agent:journal binds the Model call of the step'
          : 'agent:journal has no Model call',
        `caller-reported: Model admissions ${admitted}`,
      ],
    },
    H06: {
      connected: modelResult !== null && materialReadable && sameCall,
      evidence: [
        modelResult === null
          ? 'agent:journal has no received Model result'
          : 'model-contract:the public pusher delivered the result to the host receiver, which wrote the received entry and its material',
        sameCall
          ? 'agent:loop continued from the received entry and handed over the reply of the same Model call'
          : 'agent:no reply of the journal Model call',
        'deviation:MODEL-ACK-ARRIVAL: the Model takes its ACK through the pusher after saved; the Session-side accounting of that ACK stays open (M2)',
      ],
    },
    H07: {
      connected: log.reply !== null && ended,
      evidence: [
        log.reply === null
          ? 'session-contract:commit(recordMessage) not reached'
          : 'session-contract:commit(recordMessage participation message) committed the Agent reply',
        ended
          ? 'agent:journal state ended'
          : `agent:journal state ${snapshot?.state.kind ?? 'unread'}`,
      ],
    },
  }
}

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
      pageBytes: '1000000',
    },
  })
  if (request === null || request.operation !== 'read-history')
    return none('session-read-history-request-not-read')
  const page = await scene.history(DISCLOSED_HISTORY_KINDS)
  const response = carrySessionResponse(
    'read-history',
    {
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
    messageId,
  )
  if (response === null || response.outcome !== 'succeeded')
    return none('session-read-history-response-not-read')
  const assistant = response.body.entries.filter(entry => entry.kind === 'message.assistant')
  const texts = assistant.flatMap(entry => {
    const message = messageOf(entry)
    return message === null ? [] : [textOf(message)]
  })
  const found =
    replies.length > 0 &&
    texts.length === replies.length &&
    texts.every((text, index) => text === replies[index])
  return {
    connected: found,
    evidence: [
      'public-contract:read-history request and response read with the wire session',
      `session-contract:history.begin kinds ${page.entries.map(entry => entry.kind).join(',')}`,
      found
        ? `session-contract:history returns ${replies.length} assistant message(s) with the Model reply text, in round order`
        : 'session-contract:history has no assistant message with the Model reply text',
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// H13: the Agent records of the round, read from the Session log

async function readSessionLogRecords(
  assembly: SessionAssembly,
  scene: SessionScene,
  drive: Drive,
): Promise<ConnectedObservation> {
  const sessionLog = assembly.agentJournal
  if (sessionLog === null)
    return none(
      'agent-journal:the Agent keeps its own memory Journal; the Session log carries no Agent record (GAP-SESSION-LOG-TARGETS)',
    )
  if (drive.execution === null) return none('not-reached')
  const view = sessionLog(scene.access)
  const snapshot = await loadSnapshot(view, scene.access, drive.execution)
  const work = await assembly.transactions.readWork(scene.access)
  const run = 'ok' in work ? work.ok.run : null
  const sameExecution =
    run !== null &&
    (run.kind === 'active'
      ? run.execution.execution === String(drive.execution)
      : run.kind === 'terminal')
  const page = await scene.history()
  const handedOver = page.entries.some(
    entry => entry.kind === 'intake.handed-over' || entry.kind === 'run.batch-taken',
  )
  return {
    connected: snapshot !== null && sameExecution && handedOver,
    evidence: [
      snapshot === null
        ? 'session-adapters:journal.load on the Session log has no execution'
        : `session-adapters:journal.load on the Session log returns the execution opened under the Run grant, at ${snapshot.checkpoint.position} with ${snapshot.entries?.length ?? 0} received entr(ies)`,
      sameExecution
        ? 'session-contract:readWork binds the Run to the same execution'
        : 'session-contract:readWork binds the Run to another execution',
      handedOver
        ? 'session-contract:history carries the hand-over or batch-taken entry of the execution'
        : 'session-contract:history carries neither the hand-over nor the batch-taken entry',
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// H09: the later rounds of the main session

async function driveLaterRounds(
  deps: PathDependencies,
  assembly: SessionAssembly,
  scene: SessionScene,
  identified: Identified,
  bridges: RoundBridges,
  first: Drive,
  journal: SessionLogAgentJournal | null,
): Promise<Readonly<{ observation: ConnectedObservation; replies: readonly string[] }>> {
  const replies: string[] = first.log.reply === null ? [] : [first.log.reply.text]
  const evidenceLines: string[] = []
  if (first.agent === null || first.execution === null)
    return { observation: none('not-reached'), replies }
  const messages = deps.requests.slice(1, PATH_ROUNDS)
  if (messages.length < PATH_ROUNDS - 1)
    return { observation: none(`path:fewer than ${PATH_ROUNDS} requests supplied`), replies }
  let connected = true
  for (const [index, message] of messages.entries()) {
    const round = index + 2
    const drive = await driveRound(deps, assembly, scene, identified, bridges, {
      round,
      message,
      scenario: 'reply',
      instance: first.agent.instance,
      existing: first.agent,
      journal,
    })
    const reason = drive.observation.evidence[0] ?? 'unknown'
    if (!drive.observation.connected || drive.log.reply === null) {
      connected = false
      evidenceLines.push(`round ${round}: ${reason}`)
      if (reason.startsWith('session-startRun:')) {
        // The Run of the earlier round has no completed terminal on this path, so the next Run
        // cannot start. The other route, a submit to the ended execution, is probed and recorded.
        const submitted = await first.handle?.input.submit({
          principal: identified.principal,
          tenant: identified.tenant,
          execution: first.execution,
          operation: okOf(decodeAgentOperationId(`submit-round-${round}`), 'submit-operation'),
          value: {
            id: okOf(decodeAgentInputId(`input-cs-${round}`), 'submit-input'),
            content: message,
            source: null,
            priority: 'ordinary',
          },
        })
        evidenceLines.push(
          submitted === undefined
            ? `round ${round}: agent:input.submit not reached`
            : 'failure' in submitted
              ? `round ${round}: agent:input.submit ${kindOf(submitted.failure)}`
              : `round ${round}: agent:input.submit accepted`,
        )
      }
      break
    }
    replies.push(drive.log.reply.text)
    evidenceLines.push(`round ${round}: Run started, Agent replied, reply recorded`)
  }
  return {
    observation: {
      connected: connected && replies.length === PATH_ROUNDS,
      evidence: [
        `session-contract:${replies.length} of ${PATH_ROUNDS} rounds replied`,
        ...evidenceLines,
      ],
    },
    replies,
  }
}

// ---------------------------------------------------------------------------------------------
// H10, H11, H12: the probes, each in its own session

type Probe = Readonly<{
  session: SessionId
  instance: string
  scenario: AgentScenario
}>

async function openProbe(
  deps: PathDependencies,
  assembly: SessionAssembly,
  identified: Identified,
  probe: Probe,
): Promise<Readonly<{ scene: SessionScene; drive: Drive; bridges: RoundBridges } | string>> {
  const session = await createSession(deps, assembly, identified, probe.session)
  if (session.scene === null) return session.observation.evidence[0] ?? 'session-create-failed'
  const journal = assembly.agentJournal?.(session.scene.access) ?? null
  const bridges = roundBridges(session.scene, identified.tenant, deps)
  const message = deps.requests[0]
  if (message === undefined) return 'path:no request supplied'
  const drive = await driveRound(deps, assembly, session.scene, identified, bridges, {
    round: 1,
    message,
    scenario: probe.scenario,
    instance: probe.instance,
    existing: null,
    journal,
  })
  if (!drive.observation.connected || drive.agent === null || drive.execution === null)
    return drive.observation.evidence[0] ?? 'drive-failed'
  return { scene: session.scene, drive, bridges }
}

/** H10: the Model requests a tool; the Agent must run it and call the Model again. */
async function probeToolRoundTrip(
  deps: PathDependencies,
  assembly: SessionAssembly,
  identified: Identified,
): Promise<ConnectedObservation> {
  const opened = await openProbe(deps, assembly, identified, {
    session: PATH_SESSIONS.tool as SessionId,
    instance: 'instance-cs-tool',
    scenario: 'tool-call',
  })
  if (typeof opened === 'string') return none(`probe-tool:${opened}`)
  const { drive, scene } = opened
  const agent = drive.agent
  const execution = drive.execution
  if (agent === null || execution === null) return none('not-reached')
  // The Model reply with the tool call reaches the Agent, which stops where it cannot run it.
  await waitTurns(deps.replyTurns ?? 2000, () => drive.log.reply !== null)
  const snapshot = await loadSnapshot(agent, scene.access, execution)
  const invoked = agent.toolInvocations()
  const admitted = agent.admitted()
  const stopped = snapshot !== null && snapshot.state.kind !== 'ended'
  const connected = invoked > 0 && admitted >= 2 && snapshot?.state.kind === 'ended'
  return {
    connected,
    evidence: [
      drive.log.reply === null
        ? 'agent:the tool-call reply was not handed over'
        : 'agent:the tool-call reply was admitted and handed over to Session',
      `caller-reported: Tool runtime invocations ${invoked}, Model admissions ${admitted}`,
      stopped
        ? `agent:journal stopped at ${snapshot.checkpoint.position} with state ${snapshot.state.kind}; the loop refuses a reply with tool calls (I4, #502 stage 2)`
        : 'agent:journal state ended',
      'execution-environment:files and command facilities not reached (GAP-TOOL-LOOP)',
    ],
  }
}

/** H11: the Agent instance is withdrawn during a Model call and assembled again. */
async function probeReassembly(
  deps: PathDependencies,
  assembly: SessionAssembly,
  identified: Identified,
): Promise<ConnectedObservation> {
  const opened = await openProbe(deps, assembly, identified, {
    session: PATH_SESSIONS.reassembly as SessionId,
    instance: 'instance-cs-reassembly',
    scenario: 'held',
  })
  if (typeof opened === 'string') return none(`probe-reassembly:${opened}`)
  const { drive, scene } = opened
  const agent = drive.agent
  const execution = drive.execution
  if (agent === null || execution === null) return none('not-reached')
  // Wait until the Model call is admitted and the loop waits for its result.
  await waitTurns(deps.replyTurns ?? 2000, () => agent.admitted() > 0)
  const access = { principal: identified.principal, tenant: identified.tenant }
  const before = await loadSnapshot(agent, scene.access, execution)
  const reason = evidence('reassembly/withdraw') as AgentEvidence
  const quiesced = await agent.provider.control.quiesce({
    ...access,
    operation: okOf(decodeAgentOperationId('quiesce-cs'), 'quiesce-operation'),
    reason,
  })
  const detached =
    before?.executionAttachment === null || before?.executionAttachment === undefined
      ? null
      : await agent.provider.recovery.detach({
          ...access,
          execution,
          operation: okOf(decodeAgentOperationId('detach-cs'), 'detach-operation'),
          authority: before.executionAttachment,
          reason,
        })
  const resumed = await agent.provider.runtime.resume({
    ...access,
    execution,
    operation: okOf(decodeAgentOperationId('resume-cs'), 'resume-operation'),
    recovery: reason,
    grant: null,
  })
  const label = (name: string, reply: { ok: unknown } | { failure: unknown } | null) =>
    reply === null
      ? `agent:${name} not reached`
      : 'failure' in reply
        ? `agent:${name} ${kindOf(reply.failure)}`
        : `agent:${name} succeeded`
  agent.releaseModel?.()
  await waitTurns(deps.replyTurns ?? 2000, () => drive.log.reply !== null)
  const after = await loadSnapshot(agent, scene.access, execution)
  const connected =
    'ok' in quiesced && resumed !== null && 'ok' in resumed && after?.state.kind === 'ended'
  return {
    connected,
    evidence: [
      `caller-reported: Model admissions ${agent.admitted()} during the call`,
      label('control.quiesce', quiesced),
      label('recovery.detach', detached),
      label('runtime.resume', resumed),
      after?.state.kind === 'ended'
        ? 'agent:the original driver continued from the received entry after the Model settled'
        : `agent:journal state ${after?.state.kind ?? 'unread'} after the Model settled`,
      'observation:the re-attachment of a StreamRef after reassembly is not exercised (#746 server-entry)',
    ],
  }
}

/** H12: the first reply carries reasoning; the next request must replay it. */
async function probeReasoningReplay(
  deps: PathDependencies,
  assembly: SessionAssembly,
  identified: Identified,
): Promise<ConnectedObservation> {
  const opened = await openProbe(deps, assembly, identified, {
    session: PATH_SESSIONS.reasoning as SessionId,
    instance: 'instance-cs-reasoning',
    scenario: 'reasoning',
  })
  if (typeof opened === 'string') return none(`probe-reasoning:${opened}`)
  const { drive, scene } = opened
  const agent = drive.agent
  const execution = drive.execution
  if (agent === null || execution === null) return none('not-reached')
  await waitTurns(deps.replyTurns ?? 2000, () => drive.log.reply !== null)
  const snapshot = await loadSnapshot(agent, scene.access, execution)
  const received = snapshot?.entries?.some(
    entry => entry.kind === 'received' && entry.delivery.producer === 'model',
  )
  const connected = drive.log.reply !== null && snapshot?.state.kind === 'ended'
  return {
    connected,
    evidence: [
      received
        ? 'model-contract:the public pusher delivered the reasoning result to the host receiver'
        : 'agent:journal has no received Model result',
      drive.log.reply === null
        ? `agent:no reply handed over; journal state ${snapshot?.state.kind ?? 'unread'} at ${snapshot?.checkpoint.position ?? 'unread'}; the loop did not consume the result with the thinking part (GAP-REASONING-REPLAY)`
        : 'agent:the reasoning reply was handed over',
      'request-context-contract:the second request with the replayed reasoning state is not reached (GAP-REASONING-REPLAY)',
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// The path

export async function runFirstTenantPath(deps: PathDependencies): Promise<FirstPathObservation> {
  const result: Record<FirstPathHop, ConnectedObservation> = {
    H01: none('not-reached'),
    H02: none('not-reached'),
    H03: none('not-reached'),
    H04: none('not-reached'),
    H05: none('not-reached'),
    H06: none('not-reached'),
    H07: none('not-reached'),
    H08: none('not-reached'),
    H09: none('not-reached'),
    H10: none('not-reached'),
    H11: none('not-reached'),
    H12: none('not-reached'),
    H13: none('not-reached'),
  }
  const registered = await registerTenant(deps)
  result.H01 = registered.observation
  if (registered.tenant === null || !registered.observation.connected) return result
  const login = await logIn(deps, registered.tenant)
  result.H02 = login.observation
  if (login.identified === null) return result
  const identified = login.identified
  // #680 B-1 item 4: the Session store derives Session participation from the Agent Journal, so
  // the access check is a required injection. Without it the assembly stays pending.
  const accessCheck: unknown = deps.sessionAccessCheck
  if (typeof accessCheck !== 'object' || accessCheck === null) {
    result.H03 = none('session-assembly:pending:sessionAccessCheck')
    return result
  }
  const assembly = deps.session({ accessCheck: deps.sessionAccessCheck })
  const session = await createSession(deps, assembly, identified, PATH_SESSIONS.main as SessionId)
  result.H03 = session.observation
  if (session.scene === null) return result
  const scene = session.scene
  const journal = assembly.agentJournal?.(scene.access) ?? null
  const bridges = roundBridges(scene, identified.tenant, deps)
  const first = deps.requests[0]
  if (first === undefined) {
    result.H04 = none('path:no request supplied')
    return result
  }
  const drive = await driveRound(deps, assembly, scene, identified, bridges, {
    round: 1,
    message: first,
    scenario: 'reply',
    instance: 'instance-cs-1',
    existing: null,
    journal,
  })
  result.H04 = drive.observation
  if (drive.agent === null || drive.execution === null) return result
  const access = { principal: identified.principal, tenant: identified.tenant }
  Object.assign(
    result,
    await observeAgent(
      await loadSnapshot(drive.agent, access, drive.execution),
      drive.log,
      drive.agent,
      access,
    ),
  )
  result.H13 = await readSessionLogRecords(assembly, scene, drive)
  const later = await driveLaterRounds(deps, assembly, scene, identified, bridges, drive, journal)
  result.H09 = later.observation
  result.H08 = await readReplies(scene, identified, later.replies)
  if (drive.log.failures.length > 0)
    for (const hop of ['H04', 'H05', 'H06', 'H07'] as const)
      result[hop] = {
        ...result[hop],
        evidence: [...result[hop].evidence, ...drive.log.failures.map(f => `bridge:${f}`)],
      }
  if (!result.H07.connected) return result
  result.H10 = await probeToolRoundTrip(deps, assembly, identified)
  result.H11 = await probeReassembly(deps, assembly, identified)
  result.H12 = await probeReasoningReplay(deps, assembly, identified)
  return result
}
