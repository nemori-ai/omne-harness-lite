// The session binding source (D-AUTH r4 4.1, R1-D14 O3). It reads the authoritative state row of
// one session in the domain of the tenant that the call names, through the work cache of the
// storage (SPEC RT-04). It proves the tenant ownership and
// the established identity only, and it does not ask the access check. An unknown session and a
// session of another tenant read alike as `not-bound`; a read that could not look is `unavailable`.
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionFailure,
  SessionId,
  SessionPrincipalBindingSource,
} from '@omne-harness/session-contract'
import { OWNER } from './cursor.ts'
import { domainOf, type SessionStorageOptions } from './context.ts'
import { readCachedWork } from './work-cache.ts'

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
      const read = await readCachedWork({
        storage: options.storage,
        domain: domain.ok.domain,
        tenant: domain.ok.text,
        session: input.session,
      })
      if (read.kind === 'absent') return succeed({ kind: 'not-bound' })
      if (read.kind === 'unavailable') return unreadable(`session binding: ${read.diagnostic}`)
      if (read.kind === 'behind')
        return unreadable('session binding: the state does not cover the tail yet')
      // The tenant and session are those of the stored record, not those of the request.
      const snapshot = read.snapshot
      return succeed({
        kind: 'bound',
        tenant: snapshot.tenant,
        session: snapshot.session,
        source: snapshot.source,
      })
    },
  }
}
