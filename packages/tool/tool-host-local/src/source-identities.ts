import { canonicalDigest, type LedgerDomain } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ConsumerRef,
  type ToolCallId,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import { callHostDomain } from './host-domains.ts'

type TenantId = LedgerDomain['tenant']

function identity<T>(decoded: { ok: T } | { failure: unknown }, text: string): T {
  if ('failure' in decoded) throw new Error(`the source minted an illegal identity: ${text}`)
  return decoded.ok
}

export function invocationSourceIdentities(
  tenant: TenantId,
  consumer: ConsumerRef,
): Readonly<{ call: ToolCallId; admission: ToolOperationId }> {
  const hash = canonicalDigest({
    tenant: [tenant.organization.text, tenant.account.text],
    consumer,
  }).slice('sha256:'.length)
  return {
    call: identity(decodeToolCallId(`call-${hash}`), 'call'),
    admission: identity(decodeToolOperationId(`admit-${hash}`), 'admission'),
  }
}

export function sourceKey(consumer: ConsumerRef): string {
  const { owner, work, position, purpose } = consumer
  return `source:${JSON.stringify([owner, work, position, purpose])}`
}

export function receivedCopyKey(consumer: ConsumerRef, keyDigest: string): string {
  return `${sourceKey(consumer)}/delivery/${keyDigest}`
}

export function isReceivedCopyKey(consumer: ConsumerRef, key: string): boolean {
  return key.startsWith(`${sourceKey(consumer)}/delivery/`)
}

export function sourceDomain(tenant: TenantId, consumer: ConsumerRef): LedgerDomain {
  return callHostDomain(tenant, 'source', invocationSourceIdentities(tenant, consumer).call)
}
