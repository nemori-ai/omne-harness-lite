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

export const BINDING_MEMO_SESSIONS = 65_536

export const BINDING_HANDLER = 'session.binding'

export type SessionPrincipalBindings = SessionPrincipalBindingSource &
  Readonly<{
    stop(): void
  }>

type BindingRead = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>
type BindingFailure = Extract<SessionFailure, { kind: 'unavailable' | 'quarantined' }>
type Bound = Extract<Extract<BindingRead, { ok: unknown }>['ok'], { kind: 'bound' }>

const unreadable = (diagnostic: string): Outcome<never, BindingFailure> =>
  fail<BindingFailure>({ kind: 'unavailable', owner: OWNER, diagnostic })

const unreadableOf = (failed: SessionFailure): Outcome<never, BindingFailure> =>
  unreadable(`session binding: ${'diagnostic' in failed ? failed.diagnostic : failed.kind}`)

const isText = (value: unknown): value is string => typeof value === 'string'

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
  return Object.freeze({
    kind: 'bound',
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

export function createBindingMemo<T = Bound>(
  limit: number,
): {
  get(key: string): T | undefined
  set(key: string, value: T): void
  readonly size: number
} {
  const kept = new Map<string, T>()
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
