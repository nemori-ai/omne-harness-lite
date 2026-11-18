import type { AccessVerdict, StartVerdict, ToolStartGuard } from '@omne-harness/tool'
import type { StartCoordinatorAccess } from './start-coordinator.ts'
import type { ToolPermitConsumption } from '@omne-harness/tool-contract/provider'
import type { RequestAccessVerdict, StartCondition, ToolRequestAccess } from './ledger-guards.ts'
import { readRequirementSource } from './start-permit-requirements.ts'

export const PROGRAMMATIC_NOT_IN_M2 = 'programmatic-not-in-m2'

export type LocalStartGuardInput<P> = Readonly<{
  access: StartCoordinatorAccess<P>
  requestAccess?: ToolRequestAccess<P>
}>

const MALFORMED = 'request-access answered a malformed authorization'
const filled = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function consumptionOf(value: unknown): ToolPermitConsumption | null {
  if (typeof value !== 'object' || value === null) return null
  const permit: unknown = Reflect.get(value, 'permit')
  const consumer: unknown = Reflect.get(value, 'consumer')
  const evidence = readRequirementSource(Reflect.get(value, 'evidence'))
  if (typeof permit !== 'object' || permit === null) return null
  if (typeof consumer !== 'object' || consumer === null || evidence === null) return null
  const id: unknown = Reflect.get(permit, 'permit')
  const tenant: unknown = Reflect.get(permit, 'tenant')
  const [owner, work, position]: unknown[] = ['owner', 'work', 'position'].map(key =>
    Reflect.get(consumer, key),
  )
  if (!filled(id) || typeof tenant !== 'object' || tenant === null) return null
  if (!filled(owner) || !filled(work) || !filled(position)) return null
  return Object.freeze({
    permit: Object.freeze({
      tenant: tenant as ToolPermitConsumption['permit']['tenant'],
      permit: id,
    }),
    consumer: Object.freeze({ owner, work, position }),
    evidence,
  })
}

// Absent is none; anything present must be a whole list of consumptions, or the answer is malformed.
function consumptionsOf(value: unknown): readonly ToolPermitConsumption[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const read = value.map(consumptionOf)
  return read.every(item => item !== null) ? (read as ToolPermitConsumption[]) : null
}

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
      ) {
        const condition = result.condition as StartCondition | null
        const authorizations = consumptionsOf(Reflect.get(result, 'authorizations'))
        if (authorizations === null) return { kind: 'unavailable', diagnostic: MALFORMED }
        return authorizations.length === 0
          ? { kind: 'allowed', condition }
          : { kind: 'allowed', condition, authorizations }
      }
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
