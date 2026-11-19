import type {
  AccessContribution,
  EndOf,
  FrameOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionCreation, SessionId } from '@omne-harness/session-contract'
import type {
  SessionObservation,
  SessionObservationEnd,
  SessionObservationFrame,
} from '@omne-harness/session-observation'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { createOperation, sessionIdentity, tenantTextOf } from './derivation.ts'
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
import { cancelRun } from './cancel-run.ts'
import { retryRun } from './retry-run.ts'
import { backgroundCall, listBackgroundCalls } from './background-calls.ts'
import { selectModel } from './select-model.ts'
import { stopCall } from './stop-call.ts'
import { archiveSession, listArchivedSessions, listSessions, unarchiveSession } from './archive.ts'
import type {
  DefinitionResolver,
  PrincipalFacts,
  ModelTargets,
  RunFailureCauses,
  SessionAccessFaces,
  SessionAccessSettings,
  SessionListing,
  SessionPermissionModes,
  TargetTenantPrincipals,
} from './ports.ts'
import { changePermissionMode, readPermissionMode } from './permission-mode.ts'
import { readHistory } from './read-history.ts'
import { sessionReadOperations } from './intake-reads.ts'
import type { RequestDrain } from './request-drain.ts'
import { interruptInput, querySendInput, sendInput } from './send-input.ts'

export type SessionContributionInput = Readonly<{
  faces: () => SessionAccessFaces | undefined
  observation: () => SessionObservation<Principal> | undefined
  definitions: () => DefinitionResolver | undefined
  listing: () => SessionListing | undefined
  causes: () => RunFailureCauses | undefined
  modelTargets: () => ModelTargets | undefined
  permissionModes: () => SessionPermissionModes | undefined
  principals: TargetTenantPrincipals
  facts: PrincipalFacts
  settings: SessionAccessSettings
  requests: Pick<RequestDrain, 'enqueue' | 'isQueued'>
}>

type ObserveSession = SessionProtocol['observations']['observe-session']

type TenantPrincipal = Readonly<{ principal: Principal; tenantText: string }>

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
      return step.value ?? 'unavailable'
    }
  } finally {
    await frames.return(undefined)
  }
}

type StateFrame = Extract<SessionObservationFrame, { kind: 'state' }>

// Of the last fault the protocol gives the cause and the upstream status, as the diagnostics read does.
function progressOf(
  attempts: StateFrame['attempts'],
): Pick<Extract<FrameOf<ObserveSession>, { kind: 'state' }>, 'attempts'> {
  if (attempts === null) return {}
  const { allowed, made, last, notBefore } = attempts
  const fault = last === null ? null : { cause: last.cause, upstreamStatus: last.upstreamStatus }
  return { attempts: { allowed, made, last: fault, notBefore } }
}

function frameOf(frame: SessionObservationFrame): FrameOf<ObserveSession> {
  switch (frame.kind) {
    case 'state':
      return {
        kind: 'state',
        run: frame.run,
        revision: frame.revision,
        phase: frame.phase,
        ...progressOf(frame.attempts),
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

  const factOf = (principal: Principal) => describedBy(facts, principal)
  const held = {
    admit,
    factOf,
    causes: input.causes,
    modes: input.permissionModes,
    targets: input.modelTargets,
  }
  const sending = { target, factOf, faces: input.faces, requests: input.requests }
  const listing = { principalFor, listing: input.listing, settings }

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
        return { outcome: 'denied' }
      case 'attempt-rejected':
      case 'unknown':
        return { outcome: 'unknown' }
    }
  }

  return {
    operations: {
      'create-session': (call, body) => createSession(call.principal, body),
      'query-create-session': (call, body) => queryCreateSession(call.principal, body),
      'send-input': (call, body) => sendInput(sending, call.principal, body),
      'interrupt-input': (call, body) => interruptInput(sending, call.principal, body),
      'query-send-input': (call, body) => querySendInput(sending, call.principal, body),
      'read-history': (call, body) => readHistory({ admit, settings }, call.principal, body),
      ...sessionReadOperations(held),
      'cancel-run': (call, body) => cancelRun(held, call.principal, body),
      'stop-call': (call, body) => stopCall(held, call.principal, body),
      'select-model': (call, body) => selectModel(held, call.principal, body),
      'retry-run': (call, body) => retryRun(held, call.principal, body),
      'background-call': (call, body) => backgroundCall(held, call.principal, body),
      'list-background-calls': (call, body) => listBackgroundCalls(held, call.principal, body),
      'list-sessions': (call, body) => listSessions(listing, call.principal, body),
      'list-archived-sessions': (call, body) => listArchivedSessions(listing, call.principal, body),
      'archive-session': (call, body) => archiveSession(held, call.principal, body),
      'unarchive-session': (call, body) => unarchiveSession(held, call.principal, body),
      'read-permission-mode': (call, body) => readPermissionMode(held, call.principal, body),
      'change-permission-mode': (call, body) => changePermissionMode(held, call.principal, body),
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
