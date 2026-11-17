import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { classify } from '../rows/authorization/principals.ts'

export const MODEL_HOST_COMPONENT = 'modelHostAuthority'
export const MODEL_WORK_OWNER = 'model'
export const COMPACTION_COMPONENT = 'contextCompaction'
export const COMPACTION_WORK_OWNER = 'context-compaction'

export type PrincipalClass = 'login' | 'work' | 'host'

function isOwnedWork(
  value: unknown,
  component: string,
  owner: string,
): value is ActingForTenantPrincipal {
  if (typeof value !== 'object' || value === null) return false
  if (Reflect.get(value, 'kind') !== 'acting-for-tenant') return false
  const actor: unknown = Reflect.get(value, 'actor')
  const work: unknown = Reflect.get(value, 'work')
  return (
    typeof actor === 'object' &&
    actor !== null &&
    Reflect.get(actor, 'component') === component &&
    typeof work === 'object' &&
    work !== null &&
    Reflect.get(work, 'owner') === owner &&
    typeof Reflect.get(work, 'work') === 'string'
  )
}

export function classOf(
  principal: unknown,
): Readonly<{ kind: PrincipalClass; principal: ActingForTenantPrincipal }> | null {
  const who = classify(principal)
  if (who?.column === 'login') return { kind: 'login', principal: who.principal }
  if (who?.column === 'work') return { kind: 'work', principal: who.principal }
  if (isOwnedWork(principal, COMPACTION_COMPONENT, COMPACTION_WORK_OWNER))
    return { kind: 'work', principal }
  if (isOwnedWork(principal, MODEL_HOST_COMPONENT, MODEL_WORK_OWNER))
    return { kind: 'host', principal }
  return null
}
