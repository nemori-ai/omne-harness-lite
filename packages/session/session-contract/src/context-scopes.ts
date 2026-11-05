// The Context scopes of one session (J18) without its work snapshot. The creation mints generation
// 1; afterwards only SE27 (`session.archived`, the end of the current scope) and SE28
// (`session.unarchived`, a new generation) change them. A reader that knows the tenant and the
// session reads the entries of those two kinds and folds them here. It never reads the creation
// entry and never the snapshot, so what it reads grows with the archives of the session, not with
// its history. Whether a scope belongs to a session and its generation never change; whether it has
// ended does, once.
import type { TenantId } from '@omne-harness/legal-identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeEntry } from './entries.ts'
import type { HistoryEntry } from './faces.ts'
import type { DurableEvidence, SessionId } from './identity.ts'
import { digestOf } from './operations.ts'

/** The kinds of the entries that change the Context scopes of a session after its creation. */
export const CONTEXT_SCOPE_KINDS: readonly ['session.archived', 'session.unarchived'] =
  Object.freeze(['session.archived', 'session.unarchived'] as const)

/** One Context scope of a session: its generation, its reference, and its end if it has ended. */
export type SessionContextScope = Readonly<{
  generation: string
  scope: string
  ended: DurableEvidence | null
}>

/**
 * The scope reference that Session mints for one generation of one session (J18): a one-way digest
 * of the tenant, the holder and the generation. The tenant must be minted by legal-identity.
 */
export function contextScopeOf(
  input: Readonly<{ tenant: TenantId; session: SessionId; generation: string }>,
): string {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) throw new TypeError('scope binding requires a minted tenant')
  return `session-scope:${digestOf({ tenant: tenant.value, holder: input.session, generation: input.generation })}`
}

type Binding = Readonly<{ generation: unknown; scope: unknown; ended: unknown }>
type Holder = Readonly<{ tenant: TenantId; session: SessionId }>

/** The scope binding that one SE27 or SE28 entry of `session` records, or why it is not one. */
function bindingOf(
  session: Holder,
  entry: Pick<HistoryEntry, 'kind' | 'payload'>,
): Outcome<SessionContextScope, string> {
  if (!(CONTEXT_SCOPE_KINDS as readonly string[]).includes(entry.kind))
    return fail(`${entry.kind}: not an entry that changes the context scopes`)
  const decoded = decodeEntry(entry)
  if (!('ok' in decoded))
    return fail('unknown' in decoded ? `${decoded.unknown}: unknown kind` : decoded.malformed)
  const { generation, scope, ended } = (decoded.ok as { scope?: Binding }).scope ?? {}
  if (typeof generation !== 'string' || typeof scope !== 'string')
    return fail(`${entry.kind}: the scope binding is not complete`)
  if (scope !== contextScopeOf({ ...session, generation }))
    return fail(`${entry.kind}: the scope is not the one minted for this session`)
  const end = (ended ?? null) as DurableEvidence | null
  if (entry.kind === 'session.archived' && end === null)
    return fail('session.archived: the scope has no end')
  return succeed({ generation, scope, ended: end })
}

/**
 * The Context scopes of one session, by generation, from the entries of `CONTEXT_SCOPE_KINDS` in its
 * log, in any order: the same scopes, generations and ends as `WorkSnapshot.contextScopes`.
 * Generation 1 is the one the creation minted. An entry of another kind, an entry that does not
 * decode, and a binding whose reference is not the one minted for this session and its generation
 * fail the whole: an answer about another session's scope is never this session's.
 */
export function contextScopesOf(
  session: Holder,
  entries: readonly Pick<HistoryEntry, 'kind' | 'payload'>[],
): Outcome<readonly SessionContextScope[], string> {
  const scopes = new Map<string, SessionContextScope>([
    ['1', { generation: '1', scope: contextScopeOf({ ...session, generation: '1' }), ended: null }],
  ])
  for (const entry of entries) {
    const binding = bindingOf(session, entry)
    if ('failure' in binding) return binding
    const { generation } = binding.ok
    // The end is kept once seen: an archived scope is never open again (J18).
    const ended = scopes.get(generation)?.ended ?? binding.ok.ended
    scopes.set(generation, { ...binding.ok, ended })
  }
  return succeed(
    [...scopes.values()].sort((left, right) => Number(left.generation) - Number(right.generation)),
  )
}
