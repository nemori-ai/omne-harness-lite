import type { MembershipStanding, TenantId } from '@omne-harness-lite/identity-values'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { InputSourceDependencies } from './types.ts'
import { SourceUnavailable } from './data.ts'

export type RegistryReadUnit = <T>(
  scope: { readonly session: string; readonly tenant: TenantId },
  read: (unit: StorageUnit, current?: MembershipStanding) => Promise<T>,
) => Promise<T>

export function createCurrentRegistryReadUnit(
  dependencies: Pick<InputSourceDependencies, 'storage' | 'memberships'>,
): RegistryReadUnit {
  if (typeof dependencies.memberships?.participate !== 'function')
    throw new TypeError('registry reader requires current membership participation')
  const storage = dependencies.storage
  const participate = dependencies.memberships.participate.bind(dependencies.memberships)
  return (scope, read) =>
    storage.atomic(async unit => {
      const current = await participate(unit).standing(scope.tenant)
      if (!('standing' in current) || current.standing !== 'effective')
        throw new SourceUnavailable('current_membership')
      return read(unit, current)
    })
}
