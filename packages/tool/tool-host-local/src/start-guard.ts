// The start guard of the guard table (row 5): the current invocation kind and the current
// qualification of one start. It keeps no verdict. The start fence (permit, acceptance, exclusion)
// is the start coordinator's; this guard answers only what is true now.
//
// Known limitation (review N7): a fact of the definition side, such as a binding that closed or
// drained after the admission, is not asked here. The fence invalidation of its owner covers it.
import type { AccessVerdict, StartVerdict, ToolStartGuard } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from './start-coordinator.ts'

/** The refusal reason of a call that is not direct: M2 has no programmatic call. */
export const PROGRAMMATIC_NOT_IN_M2 = 'programmatic-not-in-m2'

export type LocalStartGuardInput<P> = Readonly<{
  /** The `start` view of the host access: the same adapter object that gives the ledger its access. */
  access: StartCoordinatorAccess<P>
}>

/**
 * Builds the start guard. A call whose invocation is not `direct` is `refused` without asking the
 * access. Otherwise the access is asked for the action `start` on every call of `qualifyStart`:
 * `allowed` is `allowed`, `denied` is `refused`, and an access that cannot answer or throws is
 * `unavailable`, never `allowed`.
 */
export function createLocalStartGuard<P>(input: LocalStartGuardInput<P>): ToolStartGuard<P> {
  if (typeof input !== 'object' || input === null) throw new TypeError('input: missing')
  const { access } = input
  if (typeof access?.qualify !== 'function') throw new TypeError('access.qualify: missing')
  const guard: ToolStartGuard<P> = {
    qualifyStart: async ({ principal, tenant, call, request }): Promise<StartVerdict> => {
      if (request.invocation.kind !== 'direct')
        return { kind: 'refused', reason: PROGRAMMATIC_NOT_IN_M2 }
      let verdict: AccessVerdict
      try {
        verdict = await access.qualify({ principal, tenant, call, action: 'start' })
      } catch {
        return {
          kind: 'unavailable',
          diagnostic: 'the start access threw an exception; its message is not reported',
        }
      }
      if (verdict.kind === 'allowed') return { kind: 'allowed' }
      if (verdict.kind === 'denied') return { kind: 'refused', reason: 'qualification-denied' }
      return { kind: 'unavailable', diagnostic: verdict.diagnostic }
    },
  }
  return Object.freeze(guard)
}
