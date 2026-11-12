// The scope owner source (SessionScopeOwnerSource): the session that minted a Context scope, from
// `sl_scope_idx`, which the `session` participant writes in the commit that mints the scope. It does
// not ask the access check: like the session binding source it is a trusted read of an ownership
// fact, for the trusted closure of the assembly.
//
// The scope text is a one-way digest of the tenant, the session and the generation, so the source
// cannot tell the tenant from it: it reads `session.scope-owner` in the domain of each registered
// tenant, in tenant order, and stops at the first that owns the scope. An owned answer never changes,
// so it is kept and read no more; `unknown` is never kept, since the scope may be minted next. A
// domain that could not be read makes the answer `unavailable`, never `unknown`: the scope may be
// there. After `stop`, every read is `unavailable`, kept answers included.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionFailure,
  SessionId,
  SessionScopeOwnerSource,
} from '@omne-harness/session-contract'
import { createBindingMemo } from './bindings.ts'
import { OWNER } from './cursor.ts'
import { readHandler, type SessionStorageOptions } from './context.ts'

export type SessionScopeOwnersOptions = Pick<SessionStorageOptions<unknown>, 'storage' | 'domains'>

export const SCOPE_OWNER_HANDLER = 'session.scope-owner'

/** The scopes whose owner the source keeps; past it the oldest one goes and is read again. */
export const SCOPE_OWNER_MEMO = 65_536

/** The source, and the one way to end it. */
export type SessionScopeOwners = SessionScopeOwnerSource & Readonly<{ stop(): void }>

type Lookup = Awaited<ReturnType<SessionScopeOwnerSource['lookup']>>
type Owned = Extract<Extract<Lookup, { ok: unknown }>['ok'], { kind: 'owned' }>

type Failure = Extract<SessionFailure, { kind: 'unavailable' }>

const unreadable = (diagnostic: string): Outcome<never, Failure> =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic: `scope owner: ${diagnostic}` })

type TenantEntry = Readonly<{ tenant: string; domain: Parameters<typeof readHandler>[1] }>

/** One point read in the domain of one tenant: its owner of `scope`, `null` when it has none. */
async function ownerIn(
  reach: Parameters<typeof readHandler>[0],
  entry: TenantEntry,
  scope: string,
): Promise<Outcome<Owned | null, Failure>> {
  const tenant = tenantCodec.parse(entry.tenant)
  if (!tenant.ok) return unreadable('the tenant domain directory holds an entry of no tenant')
  let read
  try {
    read = await readHandler(reach, entry.domain, SCOPE_OWNER_HANDLER, {
      tenant: entry.tenant,
      scope,
    })
  } catch (error) {
    return unreadable(`read threw: ${error instanceof Error ? error.message : String(error)}`)
  }
  if ('failure' in read)
    return unreadable('diagnostic' in read.failure ? read.failure.diagnostic : read.failure.kind)
  if (read.ok['kind'] === 'unknown') return succeed(null)
  const { session, generation } = read.ok
  if (read.ok['kind'] !== 'owned' || typeof session !== 'string' || typeof generation !== 'string')
    return unreadable('the record does not parse')
  return succeed(
    Object.freeze({
      kind: 'owned' as const,
      tenant: tenant.value as TenantId,
      session: session as SessionId,
      generation,
    }),
  )
}

export function createSessionScopeOwners(options: SessionScopeOwnersOptions): SessionScopeOwners {
  const reach = { options }
  const memo = createBindingMemo<Owned>(SCOPE_OWNER_MEMO)
  let stopped = false
  return {
    stop: () => {
      stopped = true
    },
    async lookup(input): Promise<Lookup> {
      if (stopped) return unreadable('the session storage is closing')
      if (typeof input.scope !== 'string' || input.scope === '')
        return unreadable('the scope is not a scope text')
      const kept = memo.get(input.scope)
      if (kept !== undefined) return succeed(kept)
      const listed = await options.domains.snapshot()
      if (listed.kind !== 'ready') return unreadable(`tenant domains: ${listed.diagnostic}`)
      const entries = [...listed.value.entries].sort((a, b) => (a.tenant < b.tenant ? -1 : 1))
      for (const entry of entries) {
        const owner = await ownerIn(reach, entry, input.scope)
        if ('failure' in owner) return owner
        if (owner.ok === null) continue
        memo.set(input.scope, owner.ok)
        return succeed(owner.ok)
      }
      return succeed({ kind: 'unknown' })
    },
  }
}
