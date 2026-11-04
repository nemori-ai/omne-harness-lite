// The session binding source (D-AUTH r4 4.1, R1-D14 O3). It proves the tenant ownership of one
// session in the domain of the tenant that the call names, and the evidence that established the
// session, and it does not ask the access check. An unknown session and a session of another tenant
// read alike as `not-bound`; a read that could not look is `unavailable`.
//
// The ownership and the establishing evidence (the evidence of the batch that created the session)
// never change once the session exists. The read is therefore narrow: the handler `session.binding`
// reads the journal row and the entries of the first batch, never the work snapshot, so its cost does
// not grow with the session. A `bound` answer is kept in the process and read no more; `not-bound`
// and `unavailable` are never kept, since the session may be created next. After `stop`, every read
// is `unavailable`, kept answers included.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionFailure,
  SessionId,
  SessionPrincipalBindingSource,
} from '@omne-harness/session-contract'
import type { DomainRef } from '@omne-harness/sql-contract'
import { OWNER } from './cursor.ts'
import { domainOf, readHandler, type SessionStorageOptions, type StorageReach } from './context.ts'
import { workKey } from './work-cache.ts'

export type SessionPrincipalBindingsOptions = Pick<
  SessionStorageOptions<unknown>,
  'storage' | 'domains'
>

/** The sessions whose `bound` answer the source keeps; past it the oldest one goes and is read again. */
export const BINDING_MEMO_SESSIONS = 65_536

export const BINDING_HANDLER = 'session.binding'

/** The source, and the one way to end it. */
export type SessionPrincipalBindings = SessionPrincipalBindingSource &
  Readonly<{
    /** From now on every read is `unavailable` with a diagnostic that tells the storage is closing. */
    stop(): void
  }>

type BindingRead = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>
type BindingFailure = Extract<SessionFailure, { kind: 'unavailable' | 'quarantined' }>
type Bound = Extract<Extract<BindingRead, { ok: unknown }>['ok'], { kind: 'bound' }>

const unreadable = (diagnostic: string): Outcome<never, BindingFailure> =>
  fail<BindingFailure>({ kind: 'unavailable', owner: OWNER, diagnostic })

/** A failure of the domain or of the storage read. It never reads as `not-bound`. */
const unreadableOf = (failed: SessionFailure): Outcome<never, BindingFailure> =>
  unreadable(`session binding: ${'diagnostic' in failed ? failed.diagnostic : failed.kind}`)

const isText = (value: unknown): value is string => typeof value === 'string'

/** The `bound` answer of a handler output for the named tenant and session, or why it is not one. */
function boundOf(
  output: Readonly<Record<string, unknown>>,
  named: Readonly<{ tenant: string; session: string }>,
): Bound | string {
  const { tenant, session, source } = output
  if (tenant !== named.tenant || session !== named.session)
    return 'the record names another tenant or session'
  const evidence = source as Readonly<Record<string, unknown>> | null
  if (
    typeof evidence !== 'object' ||
    evidence === null ||
    !isText(evidence['owner']) ||
    !isText(evidence['record']) ||
    !isText(evidence['revision']) ||
    !isText(evidence['digest'])
  )
    return 'the establishing evidence is not complete'
  const parsed = tenantCodec.parse(named.tenant)
  if (!parsed.ok) return 'the tenant text does not parse'
  // Kept and shared by every reader of the session, so it is frozen.
  return Object.freeze({
    kind: 'bound',
    // The tenant and session are those of the stored record, not those of the request.
    tenant: parsed.value as TenantId,
    session: session as SessionId,
    source: Object.freeze({
      owner: evidence['owner'],
      record: evidence['record'],
      revision: evidence['revision'],
      digest: evidence['digest'],
    }),
  })
}

/** The answers kept by key; the oldest one goes first when `limit` is passed. */
export function createBindingMemo(limit: number): {
  get(key: string): Bound | undefined
  set(key: string, value: Bound): void
  readonly size: number
} {
  const kept = new Map<string, Bound>()
  return {
    get: key => kept.get(key),
    set(key, value) {
      kept.delete(key)
      kept.set(key, value)
      for (const oldest of kept.keys()) {
        if (kept.size <= limit) break
        kept.delete(oldest)
      }
    },
    get size() {
      return kept.size
    },
  }
}

/** One `session.binding` read mapped to the answer of the source; only `bound` is worth keeping. */
async function readBound(
  reach: StorageReach,
  domain: DomainRef,
  named: Readonly<{ tenant: string; session: string }>,
): Promise<BindingRead> {
  let read
  try {
    read = await readHandler(reach, domain, BINDING_HANDLER, named)
  } catch (error) {
    return unreadable(
      `session binding: read ${BINDING_HANDLER} threw: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if ('failure' in read) return unreadableOf(read.failure)
  const { kind } = read.ok
  if (kind === 'absent') return succeed({ kind: 'not-bound' })
  if (kind === 'unestablished')
    return unreadable('session binding: the session has no creating batch')
  if (kind !== 'bound') return unreadable(`read ${BINDING_HANDLER}: an unknown answer`)
  const bound = boundOf(read.ok, named)
  return typeof bound === 'string' ? unreadable(`session binding: ${bound}`) : succeed(bound)
}

export function createSessionPrincipalBindings(
  options: SessionPrincipalBindingsOptions,
): SessionPrincipalBindings {
  const reach = { options }
  const memo = createBindingMemo(BINDING_MEMO_SESSIONS)
  let stopped = false
  return {
    stop: () => {
      stopped = true
    },
    read: async (
      input: Readonly<{ tenant: TenantId; session: SessionId }>,
    ): Promise<BindingRead> => {
      if (stopped) return unreadable('session binding: the session storage is closing')
      const domain = await domainOf(reach, input.tenant)
      if ('failure' in domain) return unreadableOf(domain.failure)
      const { text, domain: tenantDomain } = domain.ok
      const key = workKey(tenantDomain.transactionDomain, text, input.session)
      const kept = memo.get(key)
      if (kept !== undefined) return succeed(kept)
      const bound = await readBound(reach, tenantDomain, { tenant: text, session: input.session })
      if ('failure' in bound) return bound
      if (bound.ok.kind === 'bound') memo.set(key, bound.ok)
      return bound
    },
  }
}
