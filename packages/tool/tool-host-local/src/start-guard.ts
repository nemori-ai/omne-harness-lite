import type { AccessVerdict, StartVerdict, ToolStartGuard } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from './start-coordinator.ts'
import { z } from 'zod'
import type { ToolTargetAvailability } from './ledger-guards.ts'

export const PROGRAMMATIC_NOT_IN_M2 = 'programmatic-not-in-m2'

export type LocalStartGuardInput<P> = Readonly<{
  access: StartCoordinatorAccess<P>
  target?: ToolTargetAvailability<P>
}>

const answered = z.union([
  z.object({ kind: z.literal('allowed') }),
  z.object({ kind: z.literal('denied'), reason: z.string() }),
  z.object({ kind: z.literal('unavailable'), diagnostic: z.string() }),
])

export async function qualifyTargetAvailability<P>(
  provider: ToolTargetAvailability<P> | undefined,
  input: Parameters<ToolTargetAvailability<P>['qualify']>[0],
): Promise<AccessVerdict> {
  if (provider === undefined) return { kind: 'allowed' }
  const result = await Promise.resolve(input)
    .then(asked => provider.qualify(asked))
    .then(
      value => answered.safeParse(value),
      () => undefined,
    )
  return result?.success === true
    ? result.data
    : { kind: 'unavailable', diagnostic: 'target availability unavailable' }
}

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
      if (verdict.kind === 'allowed') {
        const target = await qualifyTargetAvailability(input.target, {
          principal,
          tenant,
          call,
          request,
        })
        return target.kind === 'denied' ? { kind: 'refused', reason: target.reason } : target
      }
      if (verdict.kind === 'denied') return { kind: 'refused', reason: 'qualification-denied' }
      return { kind: 'unavailable', diagnostic: verdict.diagnostic }
    },
  }
  return Object.freeze(guard)
}
