// What the port needs from the application: the SQL storage, the tenant domain directory, the
// current access decision and the cursor signing. Shared by the commit path and the read path.
// `qualify` is the one place where a call gets its access; the context says which step answers it.
import { randomUUID } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  SessionAccessCheck,
  SessionAccessRequest,
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
import { PROTOCOL } from './worker/schema.ts'

export type SessionStorageOptions<P> = Readonly<{
  storage: SqlStorage
  /** Construction capability of the trusted session storage composite (sql-contract 2.4). */
  domains: TenantDomainAccess
  /** The current access decision of every public read and write. There is no default permission. */
  accessCheck: SessionAccessCheck<P>
  cursorSigning: SessionCursorSigning
  /** The combination version and manifest digest the application registered for the tenant scope. */
  combination: Readonly<{ combinationVersion: string; manifestDigest: string }>
  /** Attempt generations tried for one operation. Default 8. */
  attemptLimit?: number
  /** Cursor lifetime. Default 15 minutes. */
  cursorTtlMs?: number
  now?: () => number
}>

/**
 * The step that answers the access of one call. The public port asks the access check; a delegated
 * view answers from its binding and does not ask (session-contract SPEC「当前操作的访问裁定」).
 */
export type AccessStep<P> = (
  request: SessionAccessRequest<P>,
) => Promise<Outcome<DurableEvidence, SessionFailure>>

export type Context<P> = Readonly<{
  options: SessionStorageOptions<P>
  cursor: CursorOptions
  attemptLimit: number
  access: AccessStep<P>
}>

/** The part of the options that reaches the storage. The binding read needs nothing else. */
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
    attemptLimit: options.attemptLimit ?? 8,
    access: request => checkAccess(options.accessCheck, request),
    cursor: {
      signing: options.cursorSigning,
      now: options.now ?? Date.now,
      ttlMs: options.cursorTtlMs ?? 15 * 60_000,
    },
  }
}

/** The access of one call, from the step of its context. Only an allowed answer continues. */
export function qualify<P>(
  context: Context<P>,
  request: SessionAccessRequest<P>,
): Promise<Outcome<DurableEvidence, SessionFailure>> {
  return context.access(request)
}

/** One current decision for one public call. A throwing or unavailable source does not continue. */
async function checkAccess<P>(
  accessCheck: SessionAccessCheck<P>,
  request: SessionAccessRequest<P>,
): Promise<Outcome<DurableEvidence, SessionFailure>> {
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
    case 'allowed':
      return succeed(decision.evidence)
    case 'denied':
      return failure({ kind: 'denied', action: request.operation })
    case 'unavailable':
      return failure(
        unavailable(`access check unavailable for ${request.operation}: ${decision.diagnostic}`),
      )
  }
}

export type TenantDomainRef = Readonly<{ text: string; domain: DomainRef }>

/** The domain of one tenant. A directory entry that names another tenant is refused, never used. */
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

/** One `snapshot` read. A read that did not return is `unavailable`, never an empty answer. */
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
  if (result.kind === 'read') return succeed(result.output as HandlerOutput)
  return failure(
    unavailable(`read ${handler}: ${result.kind === 'cancelled' ? 'cancelled' : result.reason}`),
  )
}
