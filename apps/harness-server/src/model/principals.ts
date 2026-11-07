import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { classify } from '../rows/authorization/principals.ts'

/** The component of the Model host system actor (DP5-C5: the service key of the holder). */
export const MODEL_HOST_COMPONENT = 'modelHostAuthority'
/** The `work.owner` of M: the Model domain owns the work, the work text is the call id. */
export const MODEL_WORK_OWNER = 'model'

export type PrincipalClass = 'login' | 'work' | 'host'

function isModelWork(value: unknown): value is ActingForTenantPrincipal {
  if (typeof value !== 'object' || value === null) return false
  if (Reflect.get(value, 'kind') !== 'acting-for-tenant') return false
  const actor: unknown = Reflect.get(value, 'actor')
  const work: unknown = Reflect.get(value, 'work')
  return (
    typeof actor === 'object' &&
    actor !== null &&
    Reflect.get(actor, 'component') === MODEL_HOST_COMPONENT &&
    typeof work === 'object' &&
    work !== null &&
    Reflect.get(work, 'owner') === MODEL_WORK_OWNER &&
    typeof Reflect.get(work, 'work') === 'string'
  )
}

/** The policy class of a verified principal, by shape; a shape outside these classes has none. */
export function classOf(
  principal: unknown,
): Readonly<{ kind: PrincipalClass; principal: ActingForTenantPrincipal }> | null {
  const who = classify(principal)
  if (who?.column === 'login') return { kind: 'login', principal: who.principal }
  if (who?.column === 'work') return { kind: 'work', principal: who.principal }
  if (isModelWork(principal)) return { kind: 'host', principal }
  return null
}
