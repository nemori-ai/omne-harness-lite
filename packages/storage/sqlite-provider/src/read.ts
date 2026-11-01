// read, control side, SP-0 only (SPEC 9.2 steps 1 to 3 and 7). The read pool, handlers and
// snapshots belong to a later closure. Until then a read of a ready domain is read_failed, never an
// empty page. A read of an absent domain does not create a file.
import type { ReadRequest, ReadResult, SqlStorage } from '@omne-harness/sql-contract'
import { type Core, sameScope } from './core.ts'
import { DOMAIN_BYTES, decodeScope, isName } from './fields.ts'

export function createRead(core: Core): SqlStorage['read'] {
  return async (input: ReadRequest, options): Promise<ReadResult> => {
    const raw = input as Partial<ReadRequest> | null
    const requestKey = isName(raw?.requestKey) ? raw.requestKey : null
    const unavailable = (reason: 'closing' | 'invalid' | 'domain_unavailable' | 'read_failed', text: string = reason): ReadResult =>
      ({
        kind: 'unavailable',
        requestKey,
        reason,
        diagnostic: core.diagnostic(text),
      }) as ReadResult
    if (core.lifecycle.closing) return unavailable('closing')
    if (options?.signal?.aborted === true) return { kind: 'cancelled', requestKey }
    const scope = decodeScope(raw?.domain?.scope)
    if (
      requestKey === null ||
      scope === null ||
      !isName(raw?.domain?.transactionDomain, DOMAIN_BYTES) ||
      !isName(raw.handler) ||
      !isName(raw.protocol) ||
      !('input' in raw)
    )
      return unavailable('invalid')
    const outcome = await core.domains.ensure(raw.domain.transactionDomain, null)
    if (outcome.kind === 'closing') return unavailable('closing')
    if (outcome.kind !== 'ready' || !sameScope(outcome.entry.scope, scope))
      return unavailable('domain_unavailable')
    return unavailable('read_failed', 'read_not_available_in_this_closure')
  }
}
