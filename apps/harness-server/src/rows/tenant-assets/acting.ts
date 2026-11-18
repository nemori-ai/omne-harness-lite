import type { TenantActing } from '@omne-harness/assets'
import {
  noArguments,
  referenceAdmissionCheck,
  type AdmissionInput,
} from '@omne-harness/authorization'
import type { PrincipalVerifier, TenantStandingSource } from '@omne-harness/identity'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import { classify } from '../authorization/principals.ts'

function publishAdmission(principal: unknown, tenant: string): AdmissionInput | undefined {
  const who = classify(principal)
  const parsed = tenantCodec.parse(tenant)
  if (who === null || who.column === 'system' || !parsed.ok) return undefined
  if (!tenantEquals(who.principal.tenant, parsed.value)) return undefined
  return {
    access: { principal: who.principal, tenant: parsed.value },
    operation: { owner: 'assets', name: 'publish' },
    target: { owner: 'assets', kind: 'tenant-scope', key: tenant },
    arguments: noArguments(),
    requires: [],
    permit: null,
  }
}

/** Whoever may act for the tenant may publish to it; asked on every call. */
export function publishActing(identity: {
  verifier: PrincipalVerifier
  standing: TenantStandingSource
}): TenantActing<unknown> {
  const admission = referenceAdmissionCheck({ ...identity, permits: null })
  return Object.freeze({
    async admit({ principal, tenant }) {
      const request = publishAdmission(principal, tenant)
      if (request === undefined) return 'denied'
      try {
        const answer = await admission.check(request)
        return answer.kind === 'allowed'
          ? 'admitted'
          : answer.kind === 'denied'
            ? 'denied'
            : 'unavailable'
      } catch {
        return 'unavailable'
      }
    },
  })
}
