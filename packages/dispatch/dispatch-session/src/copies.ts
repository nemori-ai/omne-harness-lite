import type { ContextCopies, ContextMoment, PortRead } from '@omne-harness/dispatch'
import type { SessionCalls } from './ports.ts'
import { legalTenantOf } from './sources.ts'
import { UNAVAILABLE, read, sessionId } from './support.ts'

/** A conversation longer than this is not copied into a starting input: the spawn is refused. */
export const CONTEXT_COPY_MAX_BYTES = 200_000
const NONE: PortRead<ContextMoment> = read({ kind: 'none' })

/** The moment of a spawn: the dispatching call runs inside a step, so the last assistant message of the
 * view is the one that made it, and what the model was given for that request ends on the row before it. */
export function createContextCopies(calls: Pick<SessionCalls, 'view'>): ContextCopies {
  return {
    async moment(tenant, dispatcher): Promise<PortRead<ContextMoment>> {
      const legal = legalTenantOf(tenant)
      if (legal === undefined) return NONE
      const view = await calls
        .view({ tenant: legal, session: sessionId(dispatcher), moment: null })
        .catch(() => UNAVAILABLE)
      if (view.kind !== 'read') return UNAVAILABLE
      if (view.value === 'gone') return NONE
      const { epoch, rows } = view.value
      const asked = rows.findLastIndex(row => row.message.role === 'assistant')
      const last = rows[asked - 1]
      if (last === undefined) return NONE
      const bytes = rows.slice(0, asked).reduce((sum, row) => sum + row.bytes, 0)
      if (bytes > CONTEXT_COPY_MAX_BYTES) return read({ kind: 'too-large' })
      return read({ kind: 'moment', moment: JSON.stringify([epoch, last.seq]) })
    },
  }
}
