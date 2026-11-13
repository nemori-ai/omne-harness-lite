// The contribution of `session/v1`: one handler for each of the seven operations and the frame
// source of `observe-session`. The handlers are moved from the server entry's session location
// (`packages/access/server-entry/src/session.ts`); they reach Session through the same faces and
// derived identities, and map Session's results to the same outcomes. Only `create-session` acts
// for the acting tenant the pipeline gave; the other operations carry a target tenant in the body,
// and `TargetTenantPrincipals` turns the login into a principal for it. Every port is taken at the
// call: one that is not there answers `basis-unavailable`.
import type {
  AccessContribution,
  AnswerOf,
  BodyOf,
  EndOf,
  FrameOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { judgeMessage, type Message } from '@omne-harness/message'
import type {
  DurableEvidence,
  HistoryPage,
  InputId,
  RunId,
  SessionCreation,
  SessionFailure,
  SessionId,
} from '@omne-harness/session-contract'
import type {
  SessionObservation,
  SessionObservationEnd,
  SessionObservationFrame,
} from '@omne-harness/session-observation'
import { sessionProtocol, type SessionProtocol } from '@omne-harness/session-protocol'
import {
  acceptOperation,
  controlOperation,
  createOperation,
  inputIdentity,
  loginEntryOrigin,
  sessionIdentity,
  tenantTextOf,
} from './derivation.ts'
import type {
  DefinitionResolver,
  PrincipalFact,
  PrincipalFacts,
  SessionAccessFaces,
  SessionAccessSettings,
  TargetTenantPrincipals,
} from './ports.ts'

/** What the contribution reads. Each function is called at the moment of a call. */
export type SessionContributionInput = Readonly<{
  faces: () => SessionAccessFaces | undefined
  observation: () => SessionObservation<Principal> | undefined
  definitions: () => DefinitionResolver | undefined
  principals: TargetTenantPrincipals
  facts: PrincipalFacts
  settings: SessionAccessSettings
}>

type Operations = SessionProtocol['operations']
type Name = keyof Operations & string
type Answer<K extends Name> = AnswerOf<Operations[K]>
type Body<K extends Name> = BodyOf<Operations[K]>
type ObserveSession = SessionProtocol['observations']['observe-session']

type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>
const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })

/** The target of one call: the principal for the target tenant and the session it names. */
type Target = Readonly<{
  principal: Principal
  tenant: TenantId
  tenantText: string
  session: SessionId
}>

/** The outcome of a Session failure, as the session location maps it. */
function failureOutcome(failure: SessionFailure): string {
  switch (failure.kind) {
    case 'limited':
    case 'denied':
    case 'invalid':
    case 'conflict':
    case 'archived':
    case 'frozen':
    case 'unsupported':
      return failure.kind
    case 'commit-unknown':
      return 'unknown'
    default:
      // `unavailable`, `quarantined`, and a kind outside the public result set: the session cannot
      // say allowed now.
      return 'basis-unavailable'
  }
}

/**
 * The answer of operation `name` to a Session failure. An outcome outside the operation's contract
 * is `basis-unavailable`. A codec outcome carries its body: the limit of `limited`, else empty.
 */
function refused<K extends Name>(name: K, failure: SessionFailure): Answer<K> {
  const outcomes: Readonly<Record<string, unknown>> = sessionProtocol.operations[name].outcomes
  const outcome = failureOutcome(failure)
  if (!Object.hasOwn(outcomes, outcome)) return UNAVAILABLE as Answer<K>
  if (outcomes[outcome] === true) return { outcome } as Answer<K>
  const body =
    failure.kind === 'limited' ? { resource: failure.resource, limit: failure.limit } : {}
  return { outcome, body } as Answer<K>
}

/** A commit-class Session call: a throw after the call began is `unknown`. */
async function commitCall<T>(call: () => Promise<T>): Promise<T | 'unknown'> {
  try {
    return await call()
  } catch {
    return 'unknown'
  }
}

/** A read-class Session call: a throw is `basis-unavailable`, nothing was committed. */
async function readCall<T>(call: () => Promise<T>): Promise<T | 'basis-unavailable'> {
  try {
    return await call()
  } catch {
    return 'basis-unavailable'
  }
}

/** A plain value of a json-text tree, for the message package. Keys are defined, never assigned. */
function plainOf(value: JsonValue): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(plainOf)
    case 'object': {
      const result: Record<string, unknown> = {}
      for (const entry of value.entries)
        Object.defineProperty(result, entry.key, {
          value: plainOf(entry.value),
          enumerable: true,
          writable: true,
          configurable: true,
        })
      return result
    }
  }
}

/** The message package admits the message and its role is `user`. */
function decodeUserMessage(wire: JsonValue): Message | undefined {
  const judged = judgeMessage(plainOf(wire))
  return 'ok' in judged && judged.ok.role === 'user' ? judged.ok : undefined
}

/** Whether a `pageBytes` text (digits only, no leading zero) is within the deployment bound. */
function withinPageBound(pageBytes: string, bound: number): boolean {
  const boundText = String(bound)
  return (
    pageBytes.length < boundText.length ||
    (pageBytes.length === boundText.length && pageBytes <= boundText)
  )
}

function sourceOf(evidence: DurableEvidence) {
  return {
    owner: evidence.owner,
    record: evidence.record,
    revision: evidence.revision,
    digest: evidence.digest,
  }
}

function pageOf(page: HistoryPage) {
  return {
    entries: page.entries.map(entry => ({
      entryId: entry.id,
      revision: entry.revision,
      kind: entry.kind,
      payload: entry.payload,
    })),
    next: page.next,
    exhausted: page.exhausted,
    scannedThrough: page.scannedThrough,
  }
}

/**
 * The frames of an opened observation, each written as a frame of the contract, and its end reason.
 * Closing these frames closes the observation's own.
 */
async function* framesOf(
  frames: AsyncGenerator<SessionObservationFrame, SessionObservationEnd | undefined>,
): AsyncGenerator<FrameOf<ObserveSession>, EndOf<ObserveSession>> {
  try {
    for (;;) {
      const step = await frames.next()
      if (step.done !== true) {
        yield frameOf(step.value)
        continue
      }
      // `undefined` comes only after the signal was aborted. The hub aborts it after it has
      // already ended the observation, and it no longer reads the reason (`observation-hub/hub.ts`
      // `open`), so the reason given here is never written out.
      return step.value ?? 'unavailable'
    }
  } finally {
    await frames.return(undefined)
  }
}

/**
 * One frame of session observation as a frame of `observe-session`, field by field. A kind that
 * session observation adds and the contract lacks does not compile here.
 */
function frameOf(frame: SessionObservationFrame): FrameOf<ObserveSession> {
  switch (frame.kind) {
    case 'state':
      return {
        kind: 'state',
        run: frame.run,
        revision: frame.revision,
        phase: frame.phase,
        target: frame.target === null ? null : { projection: frame.target.projection },
      }
    case 'snapshot':
    case 'delta':
      return { kind: frame.kind, projection: frame.projection, value: frame.value }
    case 'gap':
      return { kind: 'gap', reason: frame.reason }
    case 'refreshing':
      return { kind: 'refreshing' }
  }
}

export function createSessionContribution(
  input: SessionContributionInput,
): Omit<AccessContribution<SessionProtocol>, 'protocol'> {
  const { principals, facts, settings } = input

  /** The principal for the target tenant of the body. */
  async function target(
    login: LoginIdentity,
    tenant: TenantId,
    session: string,
  ): Promise<Target | Refusal> {
    const tenantText = tenantTextOf(tenant)
    let issued: Awaited<ReturnType<TargetTenantPrincipals['actingFor']>>
    try {
      issued = await principals.actingFor(login, tenantText)
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return { outcome: issued.refused }
    return { principal: issued.ok, tenant, tenantText, session: session as SessionId }
  }

  /** The tenant, account and login of a principal; `undefined` when identity cannot tell them. */
  function factOf(principal: Principal): PrincipalFact | undefined {
    try {
      return facts.describe(principal)
    } catch {
      return undefined
    }
  }

  async function createSession(
    principal: Principal,
    body: Body<'create-session'>,
  ): Promise<Answer<'create-session'>> {
    const definitions = input.definitions()
    if (definitions === undefined) return UNAVAILABLE
    const name = body.definition ?? settings.defaultDefinition
    if (name === undefined) return { outcome: 'invalid', body: {} }
    const resolved = definitions(name)
    if (resolved === undefined) return { outcome: 'invalid', body: {} }
    // A mapped definition without an initial model selection is a gap of the deployment: the
    // session could never start a run, so it is refused before Session is called.
    const initialModelSelection = resolved.initialModelSelection
    if (initialModelSelection === undefined) return UNAVAILABLE
    const fact = factOf(principal)
    if (fact === undefined) return UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const tenantText = tenantTextOf(fact.tenant)
    const session = sessionIdentity(tenantText, body.createCallId) as SessionId
    const creation: SessionCreation = {
      definition: { name, candidate: resolved.candidate },
      execution: resolved.execution,
      requiredIdentities: resolved.requiredIdentities,
      purpose: body.purpose,
      workspace: null,
      workspaceAttachment: null,
      modes: { kind: 'tenant-default', source: resolved.tenantDefaults },
      initial: null,
      entryContract: resolved.entryContract,
      initialModelSelection,
    }
    const result = await commitCall(() =>
      faces.management.create({
        principal,
        tenant: fact.tenant,
        session,
        operation: createOperation(tenantText, body.createCallId),
        creation,
      }),
    )
    if (result === 'unknown') return { outcome: 'unknown' }
    if ('failure' in result) return refused('create-session', result.failure)
    return { outcome: 'succeeded', body: { session, recovered: result.ok.receipt.recovered } }
  }

  async function queryCreateSession(
    login: LoginIdentity,
    body: Body<'query-create-session'>,
  ): Promise<Answer<'query-create-session'>> {
    const admitted = await target(
      login,
      body.tenant,
      sessionIdentity(tenantTextOf(body.tenant), body.createCallId),
    )
    if ('outcome' in admitted) return admitted
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const result = await readCall(() =>
      faces.work.queryOperation({
        principal: admitted.principal,
        tenant: admitted.tenant,
        session: admitted.session,
        operation: createOperation(admitted.tenantText, body.createCallId),
      }),
    )
    if (result === 'basis-unavailable') return UNAVAILABLE
    if ('failure' in result) return refused('query-create-session', result.failure)
    switch (result.ok.kind) {
      case 'committed':
        return { outcome: 'succeeded', body: { session: admitted.session } }
      case 'not-committed':
        // A creation that never committed means the session does not exist: denied, not disclosed.
        return { outcome: 'denied' }
      case 'attempt-rejected':
      case 'unknown':
        return { outcome: 'unknown' }
    }
  }

  async function querySendInput(
    login: LoginIdentity,
    body: Body<'query-send-input'>,
  ): Promise<Answer<'query-send-input'>> {
    const admitted = await target(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const result = await readCall(() =>
      faces.work.queryOperation({
        principal: admitted.principal,
        tenant: admitted.tenant,
        session: admitted.session,
        operation: acceptOperation(admitted.tenantText, admitted.session, body.acceptId),
      }),
    )
    if (result === 'basis-unavailable') return UNAVAILABLE
    if ('failure' in result) return refused('query-send-input', result.failure)
    switch (result.ok.kind) {
      case 'committed':
        return { outcome: 'succeeded', body: {} }
      case 'not-committed':
        return { outcome: 'not-committed', body: {} }
      case 'attempt-rejected':
      case 'unknown':
        return { outcome: 'unknown' }
    }
  }

  async function sendInput(
    login: LoginIdentity,
    body: Body<'send-input'>,
  ): Promise<Answer<'send-input'>> {
    // The message is judged before any identity call, as the session location did.
    const message = decodeUserMessage(body.message)
    if (message === undefined) return { outcome: 'protocol-rejected' }
    const admitted = await target(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    const caller = factOf(admitted.principal)
    if (caller === undefined) return UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const inputId = inputIdentity(admitted.tenantText, admitted.session, body.inputId) as InputId
    const result = await commitCall(() =>
      faces.work.accept({
        principal: admitted.principal,
        tenant: admitted.tenant,
        session: admitted.session,
        operation: acceptOperation(admitted.tenantText, admitted.session, body.acceptId),
        value: {
          kind: 'ordinary',
          input: inputId,
          message,
          origin: loginEntryOrigin(caller.account, caller.login),
        },
      }),
    )
    if (result === 'unknown') return { outcome: 'unknown' }
    if ('failure' in result) return refused('send-input', result.failure)
    return { outcome: 'succeeded', body: { recovered: result.ok.recovered } }
  }

  async function readHistory(
    login: LoginIdentity,
    body: Body<'read-history'>,
  ): Promise<Answer<'read-history'>> {
    const admitted = await target(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    if (body.cursor === null && !withinPageBound(body.pageBytes, settings.maxPageBytes))
      return { outcome: 'invalid', body: {} }
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const access = {
      principal: admitted.principal,
      tenant: admitted.tenant,
      session: admitted.session,
    }
    const result = await readCall(() =>
      body.cursor === null
        ? faces.history.begin({
            ...access,
            kinds: settings.historyKinds,
            from: null,
            direction: body.direction,
            pageBytes: Number(body.pageBytes),
          })
        : faces.history.next({ ...access, cursor: body.cursor }),
    )
    if (result === 'basis-unavailable') return UNAVAILABLE
    if ('failure' in result) return refused('read-history', result.failure)
    return { outcome: 'succeeded', body: pageOf(result.ok) }
  }

  async function cancelRun(
    login: LoginIdentity,
    body: Body<'cancel-run'>,
  ): Promise<Answer<'cancel-run'>> {
    const admitted = await target(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    const caller = factOf(admitted.principal)
    if (caller === undefined) return UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const { controlId, run } = body
    const result = await commitCall(() =>
      faces.work.cancelRun({
        principal: admitted.principal,
        tenant: admitted.tenant,
        session: admitted.session,
        operation: controlOperation(caller.login, admitted.tenantText, admitted.session, controlId),
        run: run as RunId,
        urgency: body.urgency,
      }),
    )
    if (result === 'unknown') return { outcome: 'unknown' }
    if ('failure' in result) return refused('cancel-run', result.failure)
    const saved = result.ok.answer
    switch (saved.kind) {
      case 'requested':
        return { outcome: 'succeeded', body: { kind: 'requested', controlId, run } }
      case 'ended':
        return {
          outcome: 'succeeded',
          body: {
            kind: 'ended',
            controlId,
            run,
            terminal: {
              outcome: saved.terminal.outcome,
              source: sourceOf(saved.terminal.evidence),
            },
          },
        }
      case 'not-found':
        return { outcome: 'not-found', body: {} }
    }
  }

  async function stopCall(
    login: LoginIdentity,
    body: Body<'stop-call'>,
  ): Promise<Answer<'stop-call'>> {
    const admitted = await target(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    const caller = factOf(admitted.principal)
    if (caller === undefined) return UNAVAILABLE
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const { controlId, producer } = body
    // Session judges the access first, so `denied` and unavailability come from it. For a Tool
    // target the answer is `unsupported` whatever else Session says.
    const result = await commitCall(() =>
      faces.work.stopCall({
        principal: admitted.principal,
        tenant: admitted.tenant,
        session: admitted.session,
        operation: controlOperation(caller.login, admitted.tenantText, admitted.session, controlId),
        producer,
      }),
    )
    if (result === 'unknown') return { outcome: 'unknown' }
    if (producer.kind === 'tool') {
      if ('failure' in result) {
        const { kind } = result.failure
        if (kind === 'denied') return { outcome: 'denied' }
        if (kind === 'unavailable' || kind === 'quarantined') return UNAVAILABLE
      }
      return { outcome: 'unsupported', body: {} }
    }
    if ('failure' in result) return refused('stop-call', result.failure)
    const saved = result.ok.answer
    switch (saved.kind) {
      case 'requested':
        return { outcome: 'succeeded', body: { kind: 'requested', controlId, producer } }
      case 'ended':
        return {
          outcome: 'succeeded',
          body: {
            kind: 'ended',
            controlId,
            producer,
            terminal: {
              version: saved.terminal.version,
              outcome: saved.terminal.outcome,
              source: sourceOf(saved.terminal.source),
            },
          },
        }
      case 'not-found':
        return { outcome: 'not-found', body: {} }
    }
  }

  return {
    operations: {
      'create-session': (call, body) => createSession(call.principal, body),
      'query-create-session': (call, body) => queryCreateSession(call.principal, body),
      'send-input': (call, body) => sendInput(call.principal, body),
      'query-send-input': (call, body) => querySendInput(call.principal, body),
      'read-history': (call, body) => readHistory(call.principal, body),
      'cancel-run': (call, body) => cancelRun(call.principal, body),
      'stop-call': (call, body) => stopCall(call.principal, body),
    },
    observations: {
      'observe-session': async (context, open) => {
        const admitted = await target(context.principal, open.tenant, open.session)
        if ('outcome' in admitted) return admitted
        const observation = input.observation()
        if (observation === undefined) return UNAVAILABLE
        let opened: Awaited<ReturnType<SessionObservation<Principal>['open']>>
        try {
          opened = await observation.open({
            access: {
              principal: admitted.principal,
              tenant: admitted.tenant,
              session: admitted.session,
            },
            signal: context.signal,
          })
        } catch {
          return UNAVAILABLE
        }
        switch (opened.kind) {
          case 'opened':
            return { outcome: 'succeeded', frames: framesOf(opened.frames) }
          case 'denied':
            return { outcome: 'denied' }
          case 'unavailable':
            return UNAVAILABLE
        }
      },
    },
  }
}
