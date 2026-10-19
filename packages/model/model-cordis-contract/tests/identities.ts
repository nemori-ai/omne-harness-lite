// Parsed identities for the tests. Tenants and model identities are built by the owners' own
// decoders, never by a type assertion.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  type ModelCallId,
  type ModelInstanceId,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

function decoded<T, E>(outcome: Outcome<T, E>, text: string): T {
  if (!('ok' in outcome)) throw new Error(`fixture ${text} did not decode`)
  return outcome.ok
}

export function tenantOf(organization: string, account: string): TenantId {
  const text = JSON.stringify({ organization, account })
  const parsed = tenantCodec.parse(text)
  if (!parsed.ok) throw new Error(`fixture ${text} did not parse: ${parsed.error.code}`)
  return parsed.value
}

export const tenantA = tenantOf('org_abcdefghjkmnpqrstvwxyz2345', 'acc_abcdefghjkmnpqrstvwxyz2345')
export const tenantB = tenantOf('org_abcdefghjkmnpqrstvwxyz2345', 'acc_bcdefghjkmnpqrstvwxyz23456')

export function callId(name: string): ModelCallId {
  return decoded(decodeModelCallId(`mcall_${name}`), name)
}

export function instanceId(name: string): ModelInstanceId {
  return decoded(decodeModelInstanceId(`minst_${name}`), name)
}
