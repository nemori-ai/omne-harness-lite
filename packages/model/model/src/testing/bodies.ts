import type { FixedModelRequest, ModelCallId } from '@omne-harness/model-contract'
import type { CallDocument } from '../commands/types.ts'

const idOf = (tenant: string, call: ModelCallId, digest: string) =>
  JSON.stringify([tenant, call, digest])

/**
 * The request bodies of the memory storage: one table in the process, written in the step that
 * writes the call. `callOf` reads the call document, which says which body the call owns: the one
 * of its digest, while it holds its material.
 */
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
    /** The step that releases the material of a call deletes its body. */
    release(tenant: string, call: ModelCallId, digest: string): void {
      kept.delete(idOf(tenant, call, digest))
    },
  }
}
