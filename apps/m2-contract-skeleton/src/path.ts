// The connected M2 first tenant path. Every hop calls a public entry of a contract member through a
// port that the caller passes in; this module imports only root entries and builds no double. The
// caller (the tests of this application) wires the `./testing` doubles. Each hop returns an
// observation with safe evidence labels: no credential, login proof or message body enters it.
import type { AgentProvider } from '@omne-harness/agent'
import {
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId as decodeAgentInputId,
  type AgentJournal,
  type DurableEvidence as AgentEvidence,
  type MessageHandoff,
  type RequestPreparation,
} from '@omne-harness/agent-contract'
import type { IdentityOperations } from '@omne-harness/identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import { writeJsonText } from '@omne-harness/json-text'
import type { AssemblyResult } from '@omne-harness/request-context-contract'
import {
  deriveDriveOperation,
  deriveSessionOperation,
  type CommitReceipt,
  type DurableEvidence,
  type EntryId,
  type HistoryEntry,
  type InputId,
  type MutationName,
  type SessionAccess,
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
  readGovernanceRequest,
  readGovernanceResponse,
  type GovernanceEncodeResult,
} from '@omne-harness/public-contract'
import { GOVERNANCE_LIMITS } from './governance.ts'

/** The principal of the path: the account that identity recognized from the login proof. */
export type PathPrincipal = string

export const PATH_OWNER = '@omne-harness/m2-contract-skeleton'
const VERSION = 'governance-public/1'

/** What one connected hop observed. `connected` is true only when the public calls succeeded in order. */
export type ConnectedObservation = Readonly<{
  connected: boolean
  evidence: readonly string[]
}>

/** The Agent assembled for one tenant, with the two bridges this application owns plugged in. */
export type PathAgent = Readonly<{
  provider: AgentProvider<PathPrincipal>
  journal: AgentJournal<PathPrincipal>
  /** The Agent instance that Session's `startRun` names. */
  instance: string
}>

export type PathDependencies = Readonly<{
  identity: IdentityOperations
  /** The login identifier and credential of the first tenant; they never enter the report. */
  login: Readonly<{ loginIdentifier: string; credential: string }>
  session: SessionTransactionPort<PathPrincipal>
  /** Session's evidence bridge: the guard materials of every commit, such as the login gate. */
  evidence: SessionEvidenceBridge
  /** The definition-name mapping entry of the first request (application assembly page). */
  creation: SessionCreation
  /** The text of the first request. */
  request: Message
  /**
   * Builds the Agent of the tenant. `handoff` and `requests` are the bridges of this module; the
   * caller places them as the Agent's `handoff` and `requests` dependencies.
   */
  agent(
    input: Readonly<{
      tenant: TenantId
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

export type FirstPathHop = 'H01' | 'H02' | 'H03' | 'H04' | 'H05' | 'H06' | 'H07' | 'H08'
export type FirstPathObservation = Readonly<Record<FirstPathHop, ConnectedObservation>>

const none = (reason: string): ConnectedObservation => ({ connected: false, evidence: [reason] })

function encoded(result: GovernanceEncodeResult): Uint8Array {
  if (result.kind !== 'encoded') throw new Error(`governance encode refused: ${result.kind}`)
  return result.bytes
}

function okOf<T>(outcome: { ok: T } | { failure: unknown }, what: string): T {
  if ('failure' in outcome) throw new Error(`${what}: ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

/** A Session operation id minted by the caller for the intake operations of this path (no #685 codec). */
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
export function messageOf(entry: HistoryEntry): Message | null {
  if (!entry.kind.startsWith('message.')) return null
  const plain: unknown = JSON.parse(writeJsonText(entry.payload))
  const candidate =
    typeof plain === 'object' && plain !== null && 'message' in plain
      ? (plain as { message: unknown }).message
      : null
  const judged = judgeMessage(candidate)
  return 'ok' in judged ? judged.ok : null
}

// ---------------------------------------------------------------------------------------------
// H01 and H02: governance over identity

type Identified = Readonly<{ tenant: TenantId; principal: PathPrincipal }>

export async function registerTenant(
  deps: Pick<PathDependencies, 'identity' | 'login'>,
): Promise<Readonly<{ observation: ConnectedObservation; tenant: TenantId | null }>> {
  const request = readGovernanceRequest({
    bytes: encoded(
      encodeGovernanceRequest({
        request: {
          protocolVersion: VERSION,
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
          protocolVersion: VERSION,
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
          protocolVersion: VERSION,
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
          protocolVersion: VERSION,
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
  const recognized = await deps.identity.recognizeLogin({
    loginProof: response.response.body.loginProof,
  })
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
    identified: same ? { tenant, principal: String(recognized.account) } : null,
  }
}

// ---------------------------------------------------------------------------------------------
// The bridges this application owns: Agent -> Session message hand-over, Agent -> Request Context

/** Session work that the bridges and the hops share. */
type Mutations = SessionWork<never> & SessionManagement<never> & SessionReconciliation<never>
type Commit<K extends MutationName> = Awaited<ReturnType<Mutations[K]>>

type SessionScene = Readonly<{
  access: SessionAccess<PathPrincipal>
  commit<K extends MutationName>(command: Extract<SessionCommand, { kind: K }>): Promise<Commit<K>>
  history(): Promise<readonly HistoryEntry[]>
}>

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
      return (await port.commit<K>({ command, guards: guards.ok })) as Commit<K>
    },
    async history() {
      const page = okOf(
        await port.history.begin({
          ...access,
          kinds: [],
          from: null,
          direction: 'forward',
          pageBytes: 1_000_000,
        }),
        'history.begin',
      )
      return page.entries
    },
  }
}

type Binding = { execution: string | null; sessionInput: InputId | null; written: number }

type BridgeLog = {
  handedOver: CommitReceipt | null
  reply: Readonly<{ text: string; call: string; receipt: CommitReceipt }> | null
  assembled: number
  fixed: number
  fixedMessages: number
  historyMessages: number
  lease: Readonly<{ acquired: number; outstanding: number; planned: number }> | null
  failures: string[]
}

/** The commit receipt of a mutation result: the result itself or its `receipt` field. */
function receiptOf(value: unknown): CommitReceipt | null {
  if (typeof value !== 'object' || value === null) return null
  if ('receipt' in value) return (value as { receipt: CommitReceipt }).receipt
  return 'source' in value && 'operation' in value ? (value as CommitReceipt) : null
}

function messageBridge(
  scene: SessionScene,
  binding: Binding,
  log: BridgeLog,
): MessageHandoff<PathPrincipal> {
  const reject = (reason: string) => {
    log.failures.push(reason)
    return {
      ok: { kind: 'rejected' as const, reason, evidence: evidence(`handoff/rejected/${reason}`) },
    }
  }
  return {
    async accept(input) {
      const execution = binding.execution
      const sessionInput = binding.sessionInput
      if (execution === null || sessionInput === null) return reject('no-session-run')
      if (input.source.kind === 'external-input') {
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
              result: {
                kind: 'accepted',
                receipt: evidence(`agent/accepted/${String(input.source.input)}`),
              },
            },
          },
        })
        if ('failure' in committed) return reject(`session-receive:${committed.failure.kind}`)
        const receipt = receiptOf(committed.ok)
        if (receipt === null) return reject('session-receive:no-receipt')
        log.handedOver = receipt
        return { ok: { kind: 'accepted', admission: receipt.source as AgentEvidence } }
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
        if ('failure' in committed) return reject(`session-recordMessage:${committed.failure.kind}`)
        const receipt = receiptOf(committed.ok)
        if (receipt === null) return reject('session-recordMessage:no-receipt')
        log.reply = { text: textOf(input.candidate), call: String(input.source.call), receipt }
        return { ok: { kind: 'accepted', admission: receipt.source as AgentEvidence } }
      }
      return reject(`unsupported-source:${input.source.kind}`)
    },
  }
}

function contextBridge(
  scene: SessionScene,
  tenant: TenantId,
  deps: Pick<PathDependencies, 'assemble' | 'preparationFrame'>,
  log: BridgeLog,
): RequestPreparation<PathPrincipal> {
  const unsupported = async () => ({ failure: { kind: 'unsupported' as const } })
  return {
    async prepare(input) {
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
      const entries = await scene.history()
      const history = entries.flatMap(entry => {
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
  }
  const registered = await registerTenant(deps)
  result.H01 = registered.observation
  if (registered.tenant === null || !registered.observation.connected) return result
  const login = await logIn(deps, registered.tenant)
  result.H02 = login.observation
  if (login.identified === null) return result
  const { tenant, principal } = login.identified

  // H03: create the session for the recognized tenant and principal.
  const access: SessionAccess<PathPrincipal> = {
    principal,
    tenant,
    session: 'session-cs-first' as SessionId,
  }
  const scene = sessionScene(deps.session, deps.evidence, access)
  const base = { tenant, session: access.session }
  const created = await scene.commit<'create'>({
    kind: 'create',
    input: { ...base, operation: callerOperation('create'), creation: deps.creation },
  })
  if ('failure' in created) {
    result.H03 = none(`session-create:${created.failure.kind}`)
    return result
  }
  const work = await deps.session.readWork(access)
  result.H03 = {
    connected: 'ok' in work && work.ok.session === access.session,
    evidence: [
      'session-contract:commit(create) committed for the identity tenant',
      'session-contract:readWork returns the session',
    ],
  }
  if (!result.H03.connected) return result

  // H04: the first request, the Run, and the hand-over to Agent.
  const sessionInput = 'input-cs-first' as InputId
  const accepted = await scene.commit<'accept'>({
    kind: 'accept',
    input: {
      ...base,
      operation: callerOperation('accept-first'),
      value: {
        kind: 'ordinary',
        input: sessionInput,
        message: deps.request,
        // The access layer marks a request that arrived after a successful login (#318 design).
        origin: { ...evidence('login-entry/first-request'), owner: 'login-entry' },
      },
    },
  })
  if ('failure' in accepted) {
    result.H04 = none(`session-accept:${accepted.failure.kind}`)
    return result
  }
  const binding: Binding = { execution: null, sessionInput, written: 0 }
  const log: BridgeLog = {
    handedOver: null,
    reply: null,
    assembled: 0,
    fixed: 0,
    fixedMessages: 0,
    historyMessages: 0,
    lease: null,
    failures: [],
  }
  const agent = await deps.agent({
    tenant,
    handoff: messageBridge(scene, binding, log),
    requests: contextBridge(scene, tenant, deps, log),
  })
  const startedOutcome = await scene.commit<'startRun'>({
    kind: 'startRun',
    input: {
      ...base,
      operation: callerOperation('start-run'),
      entry: 'interactive',
      candidate: deps.creation.definition.candidate,
      instance: { owner: 'agent', id: agent.instance },
    },
  })
  if ('failure' in startedOutcome) {
    result.H04 = none(`session-startRun:${startedOutcome.failure.kind}`)
    return result
  }
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
  if ('failure' in execution || 'failure' in agentInput || 'failure' in agentOperation) {
    result.H04 = none('session-execution-or-input-not-an-agent-identity')
    return result
  }
  const invoked = await agent.provider.runtime.invoke({
    principal,
    tenant,
    execution: execution.ok,
    operation: agentOperation.ok,
    initial: {
      id: agentInput.ok,
      content: deps.request,
      source: started.receipt.source as AgentEvidence,
      priority: 'ordinary',
    },
    grant: null,
  })
  if ('failure' in invoked) {
    result.H04 = none(`agent-invoke:${JSON.stringify(invoked.failure).slice(0, 80)}`)
    return result
  }
  const turns = deps.replyTurns ?? 2000
  for (let turn = 0; turn < turns && log.reply === null && log.failures.length === 0; turn += 1)
    await new Promise(resolve => setTimeout(resolve, 0))
  result.H04 = {
    connected: started.first === sessionInput && log.handedOver !== null,
    evidence: [
      'session-contract:commit(accept ordinary) committed the first request',
      'session-contract:commit(startRun) fixed the first request and opened the Run',
      'agent:runtime.invoke accepted the Session execution and input',
      log.handedOver === null
        ? 'session-contract:commit(receive input-handover) not reached'
        : 'session-contract:commit(receive input-handover) committed through the Agent message hand-over',
    ],
  }

  // H05 and H06: the Agent journal shows the assembled request, the Model call and its result.
  const loaded = await agent.journal.load({ principal, tenant, execution: execution.ok })
  const snapshot = 'ok' in loaded ? loaded.ok : null
  const modelResult =
    snapshot?.results.find(
      binding => binding.result.producer.kind === 'model' && binding.completion !== null,
    ) ?? null
  const replyCall = log.reply?.call ?? null
  const leased =
    log.lease !== null &&
    log.lease.acquired > 0 &&
    log.lease.outstanding === 0 &&
    log.lease.planned > 0
  result.H05 = {
    connected:
      log.assembled > 0 &&
      log.historyMessages > 0 &&
      leased &&
      log.fixedMessages > 0 &&
      modelResult !== null,
    evidence: [
      `request-context-contract:assemble produced the Agent request from ${log.historyMessages} Session history message(s)`,
      leased
        ? 'model-contract:Request Context acquired and released a Model preparation lease and planned the assembled input'
        : `model-contract:preparation lease not observed (${JSON.stringify(log.lease)})`,
      `agent:prepare fixed the request with ${log.fixedMessages} assembled message(s)`,
      modelResult === null
        ? 'agent:journal has no Model call'
        : 'agent:journal binds a Model call admitted through the Model runtime',
    ],
  }
  const producer = modelResult?.result.producer
  const sameCall = producer?.kind === 'model' && String(producer.call) === replyCall
  result.H06 = {
    connected: modelResult !== null && sameCall,
    evidence: [
      modelResult === null
        ? 'agent:journal has no processed Model result'
        : 'agent:journal records the Model result as processed by the Agent',
      sameCall
        ? 'agent:message hand-over carries the reply of the same Model call'
        : 'agent:no reply of the journal Model call',
    ],
  }

  // H07: the reply in the Session journal; H08: history returns the pure-message reply.
  const ended = snapshot?.state.kind === 'ended'
  result.H07 = {
    connected: log.reply !== null && ended,
    evidence: [
      log.reply === null
        ? 'session-contract:commit(recordMessage) not reached'
        : 'session-contract:commit(recordMessage participation message) committed the Agent reply',
      ended
        ? 'agent:journal state ended'
        : `agent:journal state ${snapshot?.state.kind ?? 'unread'}`,
    ],
  }
  const entries = await scene.history()
  const kinds = entries.map(entry => entry.kind)
  const replies = entries.filter(entry => entry.kind === 'message.assistant')
  const reply = log.reply
  const replied = replies[0] === undefined ? null : messageOf(replies[0])
  const found =
    reply !== null &&
    replies.length === 1 &&
    replied !== null &&
    replied.role === 'assistant' &&
    textOf(replied) === reply.text
  result.H08 = {
    connected: found,
    evidence: [
      `session-contract:history.begin kinds ${kinds.join(',')}`,
      found
        ? 'session-contract:history returns one assistant message with the Model reply text'
        : 'session-contract:history has no assistant message with the Model reply text',
    ],
  }
  if (log.failures.length > 0)
    for (const hop of ['H04', 'H05', 'H06', 'H07'] as const)
      result[hop] = {
        ...result[hop],
        evidence: [...result[hop].evidence, ...log.failures.map(f => `bridge:${f}`)],
      }
  return result
}
