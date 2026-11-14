import type { FixedModelRequest, ModelCallId } from '@omne-harness/model-contract'
import type { CallDocument } from '../commands/types.ts'

const idOf = (tenant: string, call: ModelCallId, digest: string) =>
  JSON.stringify([tenant, call, digest])

export function createMemoryBodies(
  callOf: (tenant: string, call: ModelCallId) => CallDocument | undefined,
) {
  const kept = new Map<string, FixedModelRequest>()
  return {
    put(tenant: string, call: ModelCallId, digest: string, request: FixedModelRequest): void {
      kept.set(idOf(tenant, call, digest), structuredClone(request))
    },
    read(tenant: string, call: ModelCallId): FixedModelRequest | null {
      const document = callOf(tenant, call)
      if (!document || document.request === null) return null
      const body = kept.get(idOf(tenant, call, document.requestDigest))
      return body ? structuredClone(body) : null
    },
    release(tenant: string, call: ModelCallId, digest: string): void {
      kept.delete(idOf(tenant, call, digest))
    },
  }
}
