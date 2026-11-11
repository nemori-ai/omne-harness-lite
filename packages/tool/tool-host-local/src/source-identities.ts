// The identities of an invocation source binding: the call and admission of a tenant and consumer,
// and the host domain that binding lives in. They are a function of the tenant and the consumer,
// so a retry after an issuance whose answer is unknown finds the same identities, and a reader
// computes the domain of a binding from the consumer before it reads anything. Shared by the direct
// source and the forwarding slots, which bind the same way.
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

/** The identities of the binding of one tenant and consumer. */
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

/** The key of a binding in its domain: the consumer, as a JSON text of its parts. */
export function sourceKey(consumer: ConsumerRef): string {
  const { owner, work, position, purpose } = consumer
  return `source:${JSON.stringify([owner, work, position, purpose])}`
}

/** The key of one received copy of a forwarding slot: the slot's key, the delivery key's digest. */
export function receivedCopyKey(consumer: ConsumerRef, keyDigest: string): string {
  return `${sourceKey(consumer)}/delivery/${keyDigest}`
}

/** Whether `key` is the key of a received copy of the slot of `consumer`. */
export function isReceivedCopyKey(consumer: ConsumerRef, key: string): boolean {
  return key.startsWith(`${sourceKey(consumer)}/delivery/`)
}

/** The host domain of the binding of `consumer`: the `source` aggregate of the call it names. */
export function sourceDomain(tenant: TenantId, consumer: ConsumerRef): LedgerDomain {
  return callHostDomain(tenant, 'source', invocationSourceIdentities(tenant, consumer).call)
}
