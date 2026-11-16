import type { AccessVerdict, StartVerdict, ToolStartGuard } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from './start-coordinator.ts'
import type { RequestAccessVerdict, StartCondition, ToolRequestAccess } from './ledger-guards.ts'

export const PROGRAMMATIC_NOT_IN_M2 = 'programmatic-not-in-m2'

export type LocalStartGuardInput<P> = Readonly<{
  access: StartCoordinatorAccess<P>
  requestAccess?: ToolRequestAccess<P>
}>

export async function qualifyRequestAccess<P>(
  provider: ToolRequestAccess<P> | undefined,
  input: Parameters<ToolRequestAccess<P>['qualify']>[0],
): Promise<RequestAccessVerdict> {
  if (provider === undefined) return { kind: 'allowed', condition: null }
  try {
    const result: unknown = await provider.qualify(input)
    if (typeof result === 'object' && result !== null && 'kind' in result) {
      if (
        result.kind === 'allowed' &&
        'condition' in result &&
        typeof result.condition === 'object'
      )
        return { kind: 'allowed', condition: result.condition as StartCondition | null }
      if (result.kind === 'denied' && 'reason' in result && typeof result.reason === 'string')
        return { kind: 'denied', reason: result.reason }
      if (
        result.kind === 'unavailable' &&
        'diagnostic' in result &&
        typeof result.diagnostic === 'string'
      )
        return { kind: 'unavailable', diagnostic: result.diagnostic }
    }
  } catch {}
  return { kind: 'unavailable', diagnostic: 'request-access unavailable' }
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
        const policy = await qualifyRequestAccess(input.requestAccess, {
          principal,
          tenant,
          call,
          request,
        })
        if (policy.kind === 'denied') return { kind: 'refused', reason: policy.reason }
        return policy.kind === 'allowed' ? { kind: 'allowed' } : policy
      }
      if (verdict.kind === 'denied') return { kind: 'refused', reason: 'qualification-denied' }
      return { kind: 'unavailable', diagnostic: verdict.diagnostic }
    },
  }
  return Object.freeze(guard)
}
