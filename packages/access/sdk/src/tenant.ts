import {
  encodeSessionRequest,
  readSessionRequest,
  type SessionRequest,
} from '@omne-harness/public-contract'
import { defaultLimits } from './limits.ts'

/** The local tenant identity of the public contract. Only the contract's codec mints it. */
export type TenantId = SessionRequest<'create-session'>['actingTenant']

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// The public contract exports no identity codec, so these two functions borrow its request codec:
// `query-create-session` carries a tenant in `body.tenant` and nothing else that needs a value.

/** The tenant a text names, or `undefined` when the text is not a tenant text of the contract. */
export function parseTenantText(text: string): TenantId | undefined {
  const probe = {
    protocolVersion: 'session-public/1',
    messageId: 'tenant-probe',
    operation: 'query-create-session',
    loginProof: 'tenant-probe',
    body: { tenant: text, createCallId: 'tenant-probe' },
  }
  const read = readSessionRequest({
    bytes: encoder.encode(JSON.stringify(probe)),
    limits: defaultLimits,
  })
  if (read.kind !== 'request' || read.request.operation !== 'query-create-session') return undefined
  return read.request.body.tenant
}

/** The tenant text of a tenant that `parseTenantText` or a response read produced. */
export function tenantText(tenant: TenantId): string {
  const encoded = encodeSessionRequest({
    request: {
      protocolVersion: 'session-public/1',
      messageId: 'tenant-probe',
      operation: 'query-create-session',
      proof: { kind: 'present', value: 'tenant-probe' },
      body: { tenant, createCallId: 'tenant-probe' },
    },
    limits: defaultLimits,
  })
  if (encoded.kind !== 'encoded') throw new TypeError('value is not a tenant')
  const wire = JSON.parse(decoder.decode(encoded.bytes)) as { body: { tenant: string } }
  return wire.body.tenant
}
