// The admission of the setting management (public contract「设置项」): who may list, set, describe
// or clear a tenant's own secret setting items. The same rule as the model credential management
// (`model-credential-access.ts`): only the login principal that acts for that tenant, with the
// tenant admission of authorization AU-11 and an empty `requires`. A session work principal and a
// system principal are denied: being able to call a tool is not the right to configure its key.
// The scope the port writes is always the acting tenant's; the official scope has no path here.
import { noArguments, type AdmissionInput } from '@omne-harness/authorization'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { AdmissionReader } from './action-admission.ts'
import { classify } from './principals.ts'

export type SettingsAction = 'list' | 'set' | 'describe' | 'clear'

export type SettingsVerdict =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable' }>

export type SettingsAdmissionInput = Readonly<{
  principal: unknown
  tenant: TenantId
  action: SettingsAction
}>

/** The admission request of one action, or `undefined` when the principal is not this tenant's login principal. */
export function settingsAdmission(input: SettingsAdmissionInput): AdmissionInput | undefined {
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
    operation: { owner: 'settings', name: `setting-${input.action}` },
    target: { owner: 'settings', kind: 'tenant-scope', key: tenantText.value },
    arguments: noArguments(),
    requires: [],
    permit: null,
  }
}

/** The guard reads its admission check on every call; an absent or failing check is `unavailable`. */
export function createSettingsGuard(readAdmission: AdmissionReader) {
  const qualify = async (input: SettingsAdmissionInput): Promise<SettingsVerdict> => {
    try {
      const request = settingsAdmission(input)
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
