// The admission of the model credential management (public contract「模型凭据」, model design J-MD01):
// who may bind, unbind or describe a tenant's own model credential. Only the login principal that
// acts for that tenant, with the tenant admission of authorization AU-11 and an empty `requires`:
// the tenant is a current member, the principal is the verified one and acts for this tenant. A
// session work principal and a system principal are denied: being able to send a call is not the
// right to configure the credential (Model SPEC「档案维护」, J-MD01). The tenant role does not
// decide it, as for every `member` cell of the Session and Agent tables (identity delivery spec D2).
import { noArguments, type AdmissionInput } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { AdmissionReader } from './action-admission.ts'
import { classify } from './principals.ts'

export type ModelCredentialAction = 'bind' | 'unbind' | 'describe'

export type ModelCredentialVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

/** The admission request of one action, or `undefined` when the principal is not this tenant's login principal. */
export function modelCredentialAdmission(
  input: Readonly<{ principal: unknown; tenant: TenantId; action: ModelCredentialAction }>,
): AdmissionInput | undefined {
  const who = classify(input.principal)
  const tenantText = tenantCodec.encode(input.tenant)
  if (
    who?.column !== 'login' ||
    !tenantText.ok ||
    !tenantEquals(who.principal.tenant, input.tenant)
  )
    return undefined
  return {
    access: { principal: who.principal, tenant: input.tenant },
    operation: { owner: 'model', name: `credential-${input.action}` },
    target: { owner: 'model', kind: 'tenant-credential', key: tenantText.value },
    arguments: noArguments(),
    requires: [],
    permit: null,
  }
}

/** The guard reads its admission check on every call; an absent or failing check is `unavailable`. */
export function createModelCredentialGuard(readAdmission: AdmissionReader) {
  const qualify = async (
    input: Readonly<{ principal: unknown; tenant: TenantId; action: ModelCredentialAction }>,
  ): Promise<ModelCredentialVerdict> => {
    try {
      const request = modelCredentialAdmission(input)
      if (request === undefined) return { kind: 'denied' }
      const admission = readAdmission()
      if (admission === undefined) return { kind: 'unavailable' }
      const answer = await admission.check(request)
      switch (answer.kind) {
        case 'allowed':
          return { kind: 'allowed' }
        case 'denied':
          return { kind: 'denied' }
        default:
          return { kind: 'unavailable' }
      }
    } catch {
      return { kind: 'unavailable' }
    }
  }
  return Object.freeze({ qualify })
}
