import type { TenantId } from '@omne-harness/legal-identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { decodeEntry } from './entries.ts'
import type { HistoryEntry } from './faces.ts'
import type { DurableEvidence, SessionId } from './identity.ts'
import { digestOf } from './operations.ts'

export const CONTEXT_SCOPE_KINDS: readonly ['session.archived', 'session.unarchived'] =
  Object.freeze(['session.archived', 'session.unarchived'] as const)

export type SessionContextScope = Readonly<{
  generation: string
  scope: string
  ended: DurableEvidence | null
}>

export function contextScopeOf(
  input: Readonly<{ tenant: TenantId; session: SessionId; generation: string }>,
): string {
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) throw new TypeError('scope binding requires a minted tenant')
  return `session-scope:${digestOf({ tenant: tenant.value, holder: input.session, generation: input.generation })}`
}

type Binding = Readonly<{ generation: unknown; scope: unknown; ended: unknown }>
type Holder = Readonly<{ tenant: TenantId; session: SessionId }>

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
    const ended = scopes.get(generation)?.ended ?? binding.ok.ended
    scopes.set(generation, { ...binding.ok, ended })
  }
  return succeed(
    [...scopes.values()].sort((left, right) => Number(left.generation) - Number(right.generation)),
  )
}
