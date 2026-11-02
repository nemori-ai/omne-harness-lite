import { noArguments, type SystemActionAuthorization } from '@omne-harness/authorization'
import type { SystemPrincipal } from '@omne-harness/identity'
import type { TenantDomainAccess, TenantDomains } from '@omne-harness/sql-contract'

function isSystemPrincipal(value: unknown): value is SystemPrincipal {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'system' &&
    'component' in value &&
    typeof value.component === 'string'
  )
}

export function createTenantEnumeration(
  authorization: SystemActionAuthorization,
  directory: Pick<TenantDomainAccess, 'snapshot'>,
): TenantDomains<unknown> {
  return {
    async enumerate({ principal }) {
      try {
        if (!isSystemPrincipal(principal)) return { kind: 'denied' }
        const decision = await authorization.check({
          principal,
          scope: 'system',
          operation: { owner: 'tenant-domains', name: 'enumerate' },
          target: {
            kind: 'system',
            resource: { owner: 'tenant-domains', kind: 'registered-tenants', key: 'deployment' },
          },
          arguments: noArguments(),
        })
        switch (decision.kind) {
          case 'denied':
            return { kind: 'denied' }
          case 'unavailable':
            return { kind: 'unavailable', diagnostic: decision.diagnostic }
          case 'allowed': {
            const snapshot = await directory.snapshot()
            return snapshot.kind === 'ready' ? { kind: 'ready', ...snapshot.value } : snapshot
          }
        }
      } catch {
        return {
          kind: 'unavailable',
          diagnostic: 'tenant domain enumeration failed; exception details are not reported',
        }
      }
    },
  }
}
