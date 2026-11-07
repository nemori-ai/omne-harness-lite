import { createHash } from 'node:crypto'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  decodeToolMaterialInstant,
  describedAdoption,
  type ToolMaterialSeal,
  type ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { canonicalJson, digestOf } from './evidence.ts'

/** Non-durable byte custody for assemblies under test. Never a production fallback. */
export function createMemoryToolMaterialStore<P>(): ToolMaterialStore<P> {
  type Saved = { operation: string; digest: string; seal: ToolMaterialSeal; bytes: Uint8Array }
  const values = new Map<string, Saved>()
  const deleted = new Map<
    string,
    { operation: string; digest: string; receipt: ToolMaterialSeal['evidence'] }
  >()
  const key = (
    input: Pick<Parameters<ToolMaterialStore<P>['read']>[0], 'tenant' | 'call' | 'material'>,
  ) => canonicalJson([input.tenant, input.call, input.material])
  return {
    async write(input) {
      const address = key(input)
      if (deleted.has(address)) return fail({ kind: 'conflict', operation: input.operation })
      const bytes = Uint8Array.from(input.bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const digest = digestOf([input.codec, input.source, sha256, bytes.length])
      const previous = values.get(address)
      if (previous !== undefined)
        return previous.operation === input.operation && previous.digest === digest
          ? succeed(structuredClone(previous.seal))
          : fail({ kind: 'conflict', operation: input.operation })
      const seal = {
        material: structuredClone(input.material),
        codec: structuredClone(input.codec),
        bytes: String(bytes.length),
        sha256,
        evidence: { owner: 'testing-material-store', record: address, revision: '1', digest },
      }
      values.set(address, { operation: input.operation, digest, seal, bytes })
      return succeed(structuredClone(seal))
    },
    async inspect(input) {
      const address = key(input)
      const fence = deleted.get(address)
      if (fence !== undefined)
        return succeed({ kind: 'excluded', evidence: structuredClone(fence.receipt) })
      const saved = values.get(address)
      if (saved === undefined) return succeed({ kind: 'unknown' })
      return saved.operation === input.operation
        ? succeed({ kind: 'sealed', seal: structuredClone(saved.seal) })
        : fail({ kind: 'conflict', operation: input.operation })
    },
    async read(input) {
      const saved = values.get(key(input))
      if (saved === undefined)
        return fail({
          kind: 'unavailable',
          dependency: 'testing-material-store',
          diagnostic: 'material is absent',
        })
      const offset = Number(input.offset)
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(input.maxBytes) ||
        input.maxBytes < 1
      )
        return fail({ kind: 'invalid', field: 'range', reason: 'invalid range' })
      const end = Math.min(saved.bytes.length, offset + Math.min(input.maxBytes, 65536))
      return succeed({
        bytes: saved.bytes.slice(offset, end),
        next: end < saved.bytes.length ? String(end) : null,
      })
    },
    async erase(input) {
      const address = key(input)
      const digest = digestOf(input.authorization)
      const previous = deleted.get(address)
      if (previous !== undefined)
        return previous.operation === input.operation && previous.digest === digest
          ? succeed(structuredClone(previous.receipt))
          : fail({ kind: 'conflict', operation: input.operation })
      const receipt = { owner: 'testing-material-store', record: address, revision: '2', digest }
      deleted.set(address, { operation: input.operation, digest, receipt })
      values.delete(address)
      return succeed(structuredClone(receipt))
    },
    async inspectErase(input) {
      const previous = deleted.get(key(input))
      if (previous === undefined) return succeed({ kind: 'unknown' })
      return previous.operation === input.operation
        ? succeed({ kind: 'deleted', receipt: structuredClone(previous.receipt) })
        : fail({ kind: 'conflict', operation: input.operation })
    },
  }
}

export function createMemoryToolMaterials<P>() {
  const instant = decodeToolMaterialInstant('1970-01-01T00:00:00.000Z')
  if ('failure' in instant) throw new Error('invalid fixture instant')
  return {
    provider: describedAdoption({
      owner: '@omne-harness/tool/testing',
      name: 'materials',
      revision: '1',
    }),
    store: createMemoryToolMaterialStore<P>(),
    clock: { sample: async () => succeed(instant.ok) },
  }
}
