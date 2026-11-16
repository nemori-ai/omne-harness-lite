// The text hitl-public/1-reply is in the log: changing it gives another operation for the same reply.
import { createHash } from 'node:crypto'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

export function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('human-intervention-access: tenant is not a minted TenantId')
  return encoded.value
}

export function hitlReplyIdentity(tenantText: string, replyId: string): string {
  return createHash('sha256')
    .update(JSON.stringify(['hitl-public/1-reply', tenantText, replyId]))
    .digest('hex')
}
