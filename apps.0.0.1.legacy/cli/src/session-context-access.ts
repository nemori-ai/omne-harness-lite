import type {
  AdmissionSource,
  LocalSessionAccessOptions,
  LocalSessionIngress,
} from '@omne-harness-lite/session-runtime-local'
import {
  isOk,
  parseTenantId,
  tenantIdEquals,
  type TenantId,
} from '@omne-harness-lite/identity-values'
import { parseRunLoginBinding } from './session-preparation.ts'

/** The root has already confirmed this original natural-person login and fixed Ingress source. */
export function createSessionContextReadGrant(
  ingress: LocalSessionIngress,
  source: AdmissionSource,
  tenant: TenantId,
  policy: Pick<LocalSessionAccessOptions, 'consumers' | 'policy'>,
): Omit<LocalSessionAccessOptions, 'tenant'> {
  const binding = parseRunLoginBinding(source),
    parsedTenant = parseTenantId(tenant)
  if (!binding || !isOk(parsedTenant) || binding.accountId !== parsedTenant.ok.account)
    throw new TypeError('Confirmed fixed Context read source required')
  const fixedTenant = Object.freeze(parsedTenant.ok)
  const principal = Object.freeze({ principal: binding.accountId, principalKind: 'human' as const })
  return Object.freeze({
    principal,
    consumers: Object.freeze([...policy.consumers]),
    operations: Object.freeze(['context.read'] as const),
    policy: Object.freeze({ ...policy.policy }),
    authority: Object.freeze({
      async check(identity, operation) {
        if (
          operation !== 'context.read' ||
          identity.principal !== principal.principal ||
          identity.principalKind !== principal.principalKind ||
          !tenantIdEquals(identity.scope.tenant, fixedTenant)
        )
          return { kind: 'rejected', reason: 'notAuthorized' }
        const view = await ingress.operations.readSession(ingress.access, identity.scope.session)
        if ('kind' in view && view.kind === 'session' && view.session.lifecycle === 'active')
          return { kind: 'authorized', identity }
        return {
          kind: 'rejected',
          reason:
            'failure' in view && view.failure === 'unavailable' ? 'unavailable' : 'notAuthorized',
        }
      },
    } satisfies LocalSessionAccessOptions['authority']),
  })
}
