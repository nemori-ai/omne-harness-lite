// The session binding source (D-AUTH r4 4.1, R1-D14 O3). It reads the authoritative state row of
// one session in the domain of the tenant that the call names. It proves the tenant ownership and
// the established identity only, and it does not ask the access check. An unknown session and a
// session of another tenant read alike as `not-bound`; a read that could not look is `unavailable`.
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionFailure,
  SessionId,
  SessionPrincipalBindingSource,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue } from './codec.ts'
import { OWNER } from './cursor.ts'
import { domainOf, readHandler, type SessionStorageOptions } from './context.ts'

export type SessionPrincipalBindingsOptions = Pick<
  SessionStorageOptions<unknown>,
  'storage' | 'domains'
>

type BindingRead = Awaited<ReturnType<SessionPrincipalBindingSource['read']>>
type BindingFailure = Extract<SessionFailure, { kind: 'unavailable' | 'quarantined' }>

const unreadable = (diagnostic: string): Outcome<never, BindingFailure> =>
  fail<BindingFailure>({ kind: 'unavailable', owner: OWNER, diagnostic })

/** A failure of the domain or of the storage read. It never reads as `not-bound`. */
const unreadableOf = (failed: SessionFailure): Outcome<never, BindingFailure> =>
  unreadable(`session binding: ${'diagnostic' in failed ? failed.diagnostic : failed.kind}`)

export function createSessionPrincipalBindings(
  options: SessionPrincipalBindingsOptions,
): SessionPrincipalBindingSource {
  const reach = { options }
  return {
    read: async (
      input: Readonly<{ tenant: TenantId; session: SessionId }>,
    ): Promise<BindingRead> => {
      const domain = await domainOf(reach, input.tenant)
      if ('failure' in domain) return unreadableOf(domain.failure)
      const out = await readHandler(reach, domain.ok.domain, 'session.work', {
        tenant: domain.ok.text,
        session: input.session,
      })
      if ('failure' in out) return unreadableOf(out.failure)
      if (out.ok['kind'] === 'absent') return succeed({ kind: 'not-bound' })
      if (out.ok['kind'] !== 'state')
        return unreadable('session binding: the state does not cover the tail yet')
      // The tenant and session are those of the stored record, not those of the request.
      const snapshot = decodeValue(out.ok['snapshot'] as JsonValue) as WorkSnapshot
      return succeed({
        kind: 'bound',
        tenant: snapshot.tenant,
        session: snapshot.session,
        source: snapshot.source,
      })
    },
  }
}
