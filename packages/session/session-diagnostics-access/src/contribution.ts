import type {
  AccessContribution,
  BodyOf,
  LoginIdentity,
  Principal,
} from '@omne-harness/access-cordis-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { EntryId, SessionFailure, SessionId } from '@omne-harness/session-contract'
import type { SessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import type {
  DiagnosticsPrincipals,
  SessionDiagnosticsFaces,
  SessionDiagnosticsSettings,
} from './ports.ts'
import {
  createDiagnosticsCursors,
  projectSessionDiagnostics,
  type DiagnosticsCursors,
  type DiagnosticsLimits,
  type ProjectedPage,
} from './session-view/index.ts'
import type { SessionDiagnosticsPage } from './view-types.ts'

export type SessionDiagnosticsContributionInput = Readonly<{
  faces: () => SessionDiagnosticsFaces | undefined
  principals: DiagnosticsPrincipals
  settings: SessionDiagnosticsSettings
  cursors?: DiagnosticsCursors
}>

type Operation = SessionDiagnosticsProtocol['operations']['read-session-diagnostics']
type Body = BodyOf<Operation>
type Handler =
  AccessContribution<SessionDiagnosticsProtocol>['operations']['read-session-diagnostics']
type Answer = Awaited<ReturnType<Handler>>
type Refusal = Readonly<{ outcome: 'denied' | 'basis-unavailable' }>

type CursorBinding = Readonly<{ tenant: string; session: string }>

type Start = Readonly<{
  run: string | null
  pageBytes: number
  from: string | null
  upper: string | null
}>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const INVALID: Answer = Object.freeze({ outcome: 'invalid' as const, body: Object.freeze({}) })

function withinPageBound(pageBytes: string, bound: number): boolean {
  const boundText = String(bound)
  return (
    pageBytes.length < boundText.length ||
    (pageBytes.length === boundText.length && pageBytes <= boundText)
  )
}

function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok)
    throw new TypeError('session-diagnostics-access: tenant is not a minted TenantId')
  return encoded.value
}

function limitsOf(
  settings: SessionDiagnosticsSettings,
): Readonly<{ kinds: readonly string[]; limits: DiagnosticsLimits }> | undefined {
  const { diagnosticsKinds, maxRuns, maxCallsPerRun } = settings
  if (diagnosticsKinds === undefined || maxRuns === undefined || maxCallsPerRun === undefined)
    return undefined
  return { kinds: diagnosticsKinds, limits: { maxRuns, maxCallsPerRun } }
}

function answerOfFailure(failure: SessionFailure): Answer {
  if (failure.kind === 'denied') return { outcome: 'denied' }
  if (failure.kind === 'invalid') return INVALID
  return UNAVAILABLE
}

async function actingFor(
  principals: DiagnosticsPrincipals,
  login: LoginIdentity,
  tenantText: string,
): Promise<Readonly<{ principal: Principal }> | Refusal> {
  try {
    const issued = await principals.actingFor(login, tenantText)
    return 'refused' in issued ? { outcome: issued.refused } : { principal: issued.ok }
  } catch {
    return UNAVAILABLE
  }
}

async function readCall<T>(call: () => Promise<T>): Promise<T | 'basis-unavailable'> {
  try {
    return await call()
  } catch {
    return 'basis-unavailable'
  }
}

function pageBodyOf(
  page: ProjectedPage,
  start: Start,
  binding: CursorBinding,
  cursors: DiagnosticsCursors,
): SessionDiagnosticsPage {
  const upper = start.upper ?? page.upper
  const next =
    page.continueFrom === null
      ? null
      : cursors.seal(binding, {
          from: page.continueFrom,
          run: start.run,
          pageBytes: start.pageBytes,
          upper,
        })
  return {
    runs: page.runs,
    next,
    exhausted: page.exhausted,
    scannedThrough: page.scannedThrough,
    basis: { upper },
    gaps: page.gaps,
  }
}

export function createSessionDiagnosticsContribution(
  input: SessionDiagnosticsContributionInput,
): Omit<AccessContribution<SessionDiagnosticsProtocol>, 'protocol'> {
  const { principals, settings } = input
  const cursors = input.cursors ?? createDiagnosticsCursors()

  function startOf(body: Body, binding: CursorBinding): Start | undefined {
    if (body.cursor === null)
      return withinPageBound(body.pageBytes, settings.maxPageBytes)
        ? { run: body.run, pageBytes: Number(body.pageBytes), from: null, upper: null }
        : undefined
    return cursors.open(binding, body.cursor)
  }

  const readSessionDiagnostics: Handler = async (call, body) => {
    const tenantText = tenantTextOf(body.tenant)
    const issued = await actingFor(principals, call.principal, tenantText)
    if ('outcome' in issued) return issued
    const configured = limitsOf(settings)
    if (configured === undefined) return UNAVAILABLE
    const binding = { tenant: tenantText, session: body.session }
    const start = startOf(body, binding)
    if (start === undefined) return INVALID
    const faces = input.faces()
    if (faces === undefined) return UNAVAILABLE
    const result = await readCall(() =>
      projectSessionDiagnostics({
        access: {
          principal: issued.principal,
          tenant: body.tenant,
          session: body.session as SessionId,
        },
        history: faces.history,
        ports: faces.ports,
        kinds: configured.kinds,
        limits: configured.limits,
        run: start.run,
        pageBytes: start.pageBytes,
        from: start.from as EntryId | null,
      }),
    )
    if (result === 'basis-unavailable') return UNAVAILABLE
    if (result.kind === 'failure') return answerOfFailure(result.failure)
    const pageBody = pageBodyOf(result.page, start, binding, cursors)
    const rechecked = await actingFor(principals, call.principal, tenantText)
    if ('outcome' in rechecked) return rechecked
    return { outcome: 'succeeded', body: pageBody }
  }

  return { operations: { 'read-session-diagnostics': readSessionDiagnostics }, observations: {} }
}
