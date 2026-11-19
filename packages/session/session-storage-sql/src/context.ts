import type {
  BudgetTerms,
  InputSources,
  IntakeBasis,
  IntakeSubject,
  SessionDerivedInputs,
  SessionIntakeBudget,
} from '@omne-harness/session-contract'
import { sessionIntakeLimits, type SessionIntakeLimits } from '@omne-harness/session-contract'
import { randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  SessionAccessCheck,
  SessionAccessDecision,
  SessionAccessRequest,
  SessionClock,
  SessionFailure,
} from '@omne-harness/session-contract'
import type { SessionCursorSigning } from '@omne-harness/session-cordis-contract'
import type {
  DomainRef,
  JsonValue,
  SqlStorage,
  TenantDomainAccess,
} from '@omne-harness/sql-contract'
import { OWNER, type CursorOptions } from './cursor.ts'
import type { SessionProtectedBasisSource } from './protected-basis.ts'
import type { WorkCacheBounds } from './work-cache.ts'
import { PROTOCOL } from './worker/schema.ts'

export type SessionStorageOptions<P> = Readonly<{
  intakeLimits?: SessionIntakeLimits
  /** The registered input sources, read at each commit. Absent: every intake is unavailable. */
  sources?: InputSources
  /** The admissions of the inputs Session derives from its own log. */
  derived?: SessionDerivedInputs
  /** The budget of a tenant, read when an input already waits. Absent: `intakeLimits` applies. */
  budget?: SessionIntakeBudget
  storage: SqlStorage
  domains: TenantDomainAccess
  accessCheck: SessionAccessCheck<P>
  cursorSigning: SessionCursorSigning
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  protectedBasis?: SessionProtectedBasisSource<P>
  cursorTtlMs?: number
  workCache?: WorkCacheBounds
  clock?: Pick<SessionClock, 'sample'>
  now?: () => number
}>

export type AccessStep<P> = (
  request: SessionAccessRequest<P>,
) => Promise<Outcome<AllowedAccess, SessionFailure>>

export type AllowedAccess = Omit<Extract<SessionAccessDecision, { kind: 'allowed' }>, 'kind'>

export type Context<P> = Readonly<{
  options: SessionStorageOptions<P>
  cursor: CursorOptions
  generations: Map<string, number>
  intakeLimits: SessionIntakeLimits
  access: AccessStep<P>
}>

export type StorageReach = Readonly<{
  options: Pick<SessionStorageOptions<unknown>, 'storage' | 'domains'>
}>

export const unavailable = (diagnostic: string): SessionFailure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})
export const failure = (value: SessionFailure): Outcome<never, SessionFailure> =>
  fail<SessionFailure>(value)

export function contextOf<P>(options: SessionStorageOptions<P>): Context<P> {
  return {
    options,
    generations: new Map(),
    intakeLimits: sessionIntakeLimits(options.intakeLimits),
    access: request => checkAccess(options.accessCheck, request),
    cursor: {
      signing: options.cursorSigning,
      now: options.now ?? Date.now,
      ttlMs: options.cursorTtlMs ?? 15 * 60_000,
    },
  }
}

export async function qualify<P>(
  context: Context<P>,
  request: SessionAccessRequest<P>,
): Promise<Outcome<DurableEvidence, SessionFailure>> {
  const allowed = await context.access(request)
  return 'failure' in allowed ? allowed : succeed(allowed.ok.evidence)
}

async function checkAccess<P>(
  accessCheck: SessionAccessCheck<P>,
  request: SessionAccessRequest<P>,
): Promise<Outcome<AllowedAccess, SessionFailure>> {
  let decision
  try {
    decision = await accessCheck.check(request)
  } catch (error) {
    return failure(
      unavailable(
        `access check threw for ${request.operation}: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }
  switch (decision.kind) {
    case 'allowed': {
      const { kind: _kind, ...allowed } = decision
      return succeed(allowed)
    }
    case 'denied':
      return failure({ kind: 'denied', action: request.operation })
    case 'unavailable':
      return failure(
        unavailable(`access check unavailable for ${request.operation}: ${decision.diagnostic}`),
      )
  }
}

export type TenantDomainRef = Readonly<{ text: string; domain: DomainRef }>

export async function domainOf(
  context: StorageReach,
  tenant: TenantId,
): Promise<Outcome<TenantDomainRef, SessionFailure>> {
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    return failure({
      kind: 'invalid',
      field: 'tenant',
      reason: 'not a tenant that legal-identity minted',
    })
  const resolved = await context.options.domains.resolve({ tenant: text.value })
  if (resolved.kind !== 'ready')
    return failure(unavailable(`tenant domain: ${resolved.diagnostic}`))
  const { entry } = resolved
  if (
    entry.tenant !== text.value ||
    entry.domain.scope.kind !== 'tenant' ||
    entry.domain.scope.tenant !== text.value
  )
    return failure(unavailable('the tenant domain directory answered another tenant'))
  return succeed({ text: text.value, domain: entry.domain })
}

export type HandlerOutput = Readonly<Record<string, JsonValue>>

export async function readHandler(
  context: StorageReach,
  domain: DomainRef,
  handler: string,
  input: Readonly<Record<string, JsonValue>>,
): Promise<Outcome<HandlerOutput, SessionFailure>> {
  const result = await context.options.storage.read({
    domain,
    handler,
    protocol: PROTOCOL,
    requestKey: randomUUID(),
    input,
  })
  if (result.kind === 'read') {
    const output = result.output as HandlerOutput
    return output['kind'] === 'malformed'
      ? failure(unavailable(`read ${handler}: ${String(output['diagnostic'])}`))
      : succeed(output)
  }
  return failure(
    unavailable(`read ${handler}: ${result.kind === 'cancelled' ? 'cancelled' : result.reason}`),
  )
}

/** What this provider admits an input on: the subject of the access and the registries of now. */
export function intakeBasisOf<P>(
  context: Context<P>,
  subject: IntakeSubject | undefined,
  budget?: BudgetTerms,
): IntakeBasis {
  const { sources, derived } = context.options
  return { subject, sources: sources ?? null, derived: derived ?? null, budget }
}
