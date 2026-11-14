// The contribution of `session/v1`: one handler for each of the nine operations and the frame
// source of `observe-session`. The handlers are moved from the server entry's session location
// (`packages/access/server-entry/src/session.ts`), except `list-sessions`, which is new and reaches
// the session list through the `SessionListing` port; they reach Session through the same faces and
// derived identities, and map Session's results to the same outcomes. Only `create-session` acts
// for the acting tenant the pipeline gave; the other operations carry a target tenant in the body,
// and `TargetTenantPrincipals` turns the login into a principal for it. Every port is taken at the
// call: one that is not there answers `basis-unavailable`.
import type {
  AccessContribution,
  EndOf,
  FrameOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  DurableEvidence,
  HistoryPage,
  RunId,
  SessionCreation,
  SessionId,
} from '@omne-harness/session-contract'
import type {
  SessionObservation,
  SessionObservationEnd,
  SessionObservationFrame,
} from '@omne-harness/session-observation'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { controlOperation, createOperation, sessionIdentity, tenantTextOf } from './derivation.ts'
import {
  commitCall,
  describedBy,
  readCall,
  refused,
  UNAVAILABLE,
  type Admitted,
  type Answer,
  type Body,
  type Refusal,
  type Target,
} from './answers.ts'
import { retryRun } from './retry-run.ts'
import type {
  DefinitionResolver,
  PrincipalFacts,
  SessionAccessFaces,
  SessionAccessSettings,
  SessionListing,
  TargetTenantPrincipals,
} from './ports.ts'
import type { RequestDrain } from './request-drain.ts'
import { querySendInput, sendInput } from './send-input.ts'

/** What the contribution reads. Each function is called at the moment of a call. */
export type SessionContributionInput = Readonly<{
  faces: () => SessionAccessFaces | undefined
  observation: () => SessionObservation<Principal> | undefined
  definitions: () => DefinitionResolver | undefined
  listing: () => SessionListing | undefined
  principals: TargetTenantPrincipals
  facts: PrincipalFacts
  settings: SessionAccessSettings
  requests: Pick<RequestDrain, 'enqueue' | 'isQueued'>
}>

type ObserveSession = SessionProtocol['observations']['observe-session']

/** The principal for a target tenant, or the refusal identity gave. */
type TenantPrincipal = Readonly<{ principal: Principal; tenantText: string }>

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
    // The traversal's pinned revision: the same quantity a state frame's `revision` is.
    upper: page.upper,
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
  async function principalFor(
    login: LoginIdentity,
    tenant: TenantId,
  ): Promise<TenantPrincipal | Refusal> {
    const tenantText = tenantTextOf(tenant)
    let issued: Awaited<ReturnType<TargetTenantPrincipals['actingFor']>>
    try {
      issued = await principals.actingFor(login, tenantText)
    } catch {
      return UNAVAILABLE
    }
    if ('refused' in issued) return { outcome: issued.refused }
    return { principal: issued.ok, tenantText }
  }

  /** The principal for the target tenant, and the session the body names. */
  async function target(
    login: LoginIdentity,
    tenant: TenantId,
    session: string,
  ): Promise<Target | Refusal> {
    const issued = await principalFor(login, tenant)
    if ('outcome' in issued) return issued
    const access = { principal: issued.principal, tenant, session: session as SessionId }
    return { access, tenantText: issued.tenantText }
  }

  /** The target, then Session as it is on the tree now. */
  async function admit(
    login: LoginIdentity,
    tenant: TenantId,
    session: string,
  ): Promise<Admitted | Refusal> {
    const admitted = await target(login, tenant, session)
    if ('outcome' in admitted) return admitted
    const faces = input.faces()
    return faces === undefined ? UNAVAILABLE : { ...admitted, faces }
  }

  /** The tenant, account and login of a principal; `undefined` when identity cannot tell them. */
  const factOf = (principal: Principal) => describedBy(facts, principal)
  const sending = { target, factOf, faces: input.faces, requests: input.requests }

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
    const admitted = await admit(
      login,
      body.tenant,
      sessionIdentity(tenantTextOf(body.tenant), body.createCallId),
    )
    if ('outcome' in admitted) return admitted
    const { access, tenantText, faces } = admitted
    const result = await readCall(() =>
      faces.work.queryOperation({
        ...access,
        operation: createOperation(tenantText, body.createCallId),
      }),
    )
    if (result === 'basis-unavailable') return UNAVAILABLE
    if ('failure' in result) return refused('query-create-session', result.failure)
    switch (result.ok.kind) {
      case 'committed':
        return { outcome: 'succeeded', body: { session: access.session } }
      case 'not-committed':
        // A creation that never committed means the session does not exist: denied, not disclosed.
        return { outcome: 'denied' }
      case 'attempt-rejected':
      case 'unknown':
        return { outcome: 'unknown' }
    }
  }

  async function readHistory(
    login: LoginIdentity,
    body: Body<'read-history'>,
  ): Promise<Answer<'read-history'>> {
    const admitted = await admit(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    if (body.cursor === null && !withinPageBound(body.pageBytes, settings.maxPageBytes))
      return { outcome: 'invalid', body: {} }
    const { access, faces } = admitted
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

  async function listSessions(
    login: LoginIdentity,
    body: Body<'list-sessions'>,
  ): Promise<Answer<'list-sessions'>> {
    const issued = await principalFor(login, body.tenant)
    if ('outcome' in issued) return issued
    const listing = input.listing()
    if (listing === undefined) return UNAVAILABLE
    const limit = body.limit ?? settings.defaultListLimit
    if (limit > settings.maxListLimit) return { outcome: 'invalid', body: {} }
    const result = await readCall(() =>
      listing.list({
        principal: issued.principal,
        tenant: body.tenant,
        after: body.cursor,
        limit,
        includeArchived: body.includeArchived ?? false,
      }),
    )
    if (result === 'basis-unavailable') return UNAVAILABLE
    if ('refused' in result) {
      return result.refused === 'invalid'
        ? { outcome: 'invalid', body: {} }
        : { outcome: result.refused }
    }
    const { items, next, completeness } = result.ok
    return {
      outcome: 'succeeded',
      body: {
        sessions: items.map(item => ({
          session: item.session,
          createdAt: item.createdAt,
          lastActivityAt: item.lastActivityAt,
          lifecycle: item.lifecycle,
          title: item.title,
        })),
        next,
        completeness,
      },
    }
  }

  async function cancelRun(
    login: LoginIdentity,
    body: Body<'cancel-run'>,
  ): Promise<Answer<'cancel-run'>> {
    const admitted = await admit(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    const { access, tenantText, faces } = admitted
    const caller = factOf(access.principal)
    if (caller === undefined) return UNAVAILABLE
    const { controlId, run } = body
    const result = await commitCall(() =>
      faces.work.cancelRun({
        ...access,
        operation: controlOperation(caller.login, tenantText, access.session, controlId),
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
    const admitted = await admit(login, body.tenant, body.session)
    if ('outcome' in admitted) return admitted
    const { access, tenantText, faces } = admitted
    const caller = factOf(access.principal)
    if (caller === undefined) return UNAVAILABLE
    const { controlId, producer } = body
    // Session judges the access first, so `denied` and unavailability come from it. For a Tool
    // target the answer is `unsupported` whatever else Session says.
    const result = await commitCall(() =>
      faces.work.stopCall({
        ...access,
        operation: controlOperation(caller.login, tenantText, access.session, controlId),
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
      'send-input': (call, body) => sendInput(sending, call.principal, body),
      'query-send-input': (call, body) => querySendInput(sending, call.principal, body),
      'read-history': (call, body) => readHistory(call.principal, body),
      'cancel-run': (call, body) => cancelRun(call.principal, body),
      'stop-call': (call, body) => stopCall(call.principal, body),
      'retry-run': (call, body) => retryRun({ admit, factOf }, call.principal, body),
      'list-sessions': (call, body) => listSessions(call.principal, body),
    },
    observations: {
      'observe-session': async (context, open) => {
        const admitted = await target(context.principal, open.tenant, open.session)
        if ('outcome' in admitted) return admitted
        const observation = input.observation()
        if (observation === undefined) return UNAVAILABLE
        let opened: Awaited<ReturnType<SessionObservation<Principal>['open']>>
        try {
          opened = await observation.open({ access: admitted.access, signal: context.signal })
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
