import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  judgeToolDelivery,
  resolveToolInvocationRef,
  type Access,
  type ToolDelivery,
  type ToolDeliveryFailure,
  type ToolResultReceiver,
  type ToolSavedReceipt,
} from '@omne-harness/tool-contract'
import { judgeHandoff } from '@omne-harness/tool-contract/provider'
import type { LocalInvocationSourceInput } from './invocation-source.ts'
import {
  createInvocationForwarding,
  forwardingConsumer,
  isObject,
  nextSourceRevision,
  sourceDomain,
  sourceKey,
  TOOL_FORWARDING_OWNER,
} from './invocation-forwarding.ts'

/** Saves a complete delivery in the original source association before acknowledging custody. */
export function createForwardingReceiver<P, B extends ContentBlock>(
  input: LocalInvocationSourceInput<P>,
  forwarding: ReturnType<typeof createInvocationForwarding<P>>,
): ToolResultReceiver<P, B> {
  const saveReceived = async (
    access: Access<P>,
    delivery: ToolDelivery<B>,
  ): Promise<Outcome<ToolSavedReceipt, ToolDeliveryFailure>> => {
    const judged = judgeToolDelivery({ tenant: access.tenant, delivery })
    if ('failure' in judged) return fail({ kind: 'invalid', ...judged.failure })
    if (
      delivery.consumer.owner !== TOOL_FORWARDING_OWNER ||
      canonicalDigest(delivery.consumer) !==
        canonicalDigest(forwardingConsumer(delivery.consumer.work))
    )
      return fail({ kind: 'denied' })
    if (input.store.durability !== 'durable')
      return fail({ kind: 'unavailable', dependency: 'forwarding-durable-store' })
    // Retain a copy before any await. The incoming payload's static B is never reconstructed from storage.
    const payload = structuredClone(delivery)
    const digest = canonicalDigest(payload)
    const keyDigest = canonicalDigest(payload.key)
    const reference = resolveToolInvocationRef(payload.key.reference, access.tenant)
    if ('failure' in reference) return fail({ kind: 'denied' })
    for (let attempt = 0; attempt < input.commitAttempts; attempt++) {
      const found = await forwarding.storedOf(access, payload.consumer)
      if ('failure' in found || found.ok.stored === null)
        return fail({ kind: 'unavailable', dependency: 'invocation-source' })
      const { stored, read } = found.ok
      const verified = await forwarding.verifyStored(access, stored)
      if ('failure' in verified)
        return verified.failure.kind === 'denied'
          ? fail({ kind: 'denied' })
          : fail({ kind: 'unavailable', dependency: 'invocation-source' })
      if (
        stored.call !== reference.ok.call ||
        stored.admission !== reference.ok.admission ||
        canonicalDigest(stored.request.consumer) !== canonicalDigest(payload.consumer)
      )
        return fail({ kind: 'denied' })
      const received = stored.raw.received
      if (!Array.isArray(received))
        return fail({ kind: 'unavailable', dependency: 'invocation-source' })
      const old: unknown = received.find(
        (item: unknown) => isObject(item) && canonicalDigest(item.key) === keyDigest,
      )
      const record = `${sourceKey(payload.consumer)}/delivery/${keyDigest}`
      if (old !== undefined) {
        if (!isObject(old) || old.digest !== digest || canonicalDigest(old.payload) !== digest)
          return fail({ kind: 'conflict' })
        const handoff = judgeHandoff({ kind: 'retained', custody: old.evidence })
        if (
          'failure' in handoff ||
          handoff.ok.kind !== 'retained' ||
          handoff.ok.custody.owner !== TOOL_FORWARDING_OWNER ||
          handoff.ok.custody.record !== record ||
          handoff.ok.custody.digest !== digest
        )
          return fail({ kind: 'unavailable', dependency: 'forwarding-receipt' })
        return succeed({ key: payload.key, evidence: handoff.ok.custody })
      }
      const revision = nextSourceRevision(read.revision)
      const evidence = { owner: TOOL_FORWARDING_OWNER, record, revision, digest }
      let committed
      try {
        committed = await input.store.commit({
          domain: sourceDomain(access.tenant),
          expected: read.revision,
          revision,
          writes: [
            {
              kind: 'put',
              record: {
                kind: 'host',
                host: {
                  key: sourceKey(payload.consumer),
                  value: {
                    ...stored.raw,
                    received: [...received, { key: payload.key, digest, payload, evidence }],
                  },
                },
              },
            },
          ],
        })
      } catch {
        return fail({ kind: 'outcome-unknown' })
      }
      if (committed.kind === 'committed') return succeed({ key: payload.key, evidence })
      if (committed.kind === 'unknown') return fail({ kind: 'outcome-unknown' })
      if (committed.kind === 'unavailable')
        return fail({ kind: 'unavailable', dependency: 'invocation-source' })
    }
    return fail({ kind: 'unavailable', dependency: 'invocation-source' })
  }
  return {
    async push({ access, delivery, signal }) {
      if (signal.aborted) return fail({ kind: 'cancelled-before-accept' })
      try {
        return await saveReceived(access, delivery)
      } catch {
        return fail({ kind: 'unavailable', dependency: 'invocation-source' })
      }
    },
  }
}
