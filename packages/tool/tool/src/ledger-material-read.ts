import { createHash } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Reply, ToolFailure } from '@omne-harness/tool-contract'
import type {
  CallAccess,
  ToolMaterialSeal,
  ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'material-reader', diagnostic })

export async function readMaterialBytes<P>(
  access: CallAccess<P>,
  envelope: ToolMaterialSeal,
  store: ToolMaterialStore<P>,
): Reply<Uint8Array> {
  const expected = Number(envelope.bytes)
  if (!Number.isSafeInteger(expected) || expected < 0) return unavailable('invalid envelope length')
  const chunks: Uint8Array[] = []
  const hash = createHash('sha256')
  let offset = 0
  try {
    for (;;) {
      const page = await readMaterialPage(
        store,
        {
          ...access,
          material: envelope.material,
          offset: String(offset),
          maxBytes: 65536,
        },
        expected,
      )
      if ('failure' in page) return page
      const { bytes, next } = page.ok
      offset += bytes.length
      chunks.push(bytes.slice())
      hash.update(bytes)
      if (next === null) break
    }
    if (offset !== expected || hash.digest('hex') !== envelope.sha256)
      return unavailable('stored envelope is incomplete or corrupt')
    return succeed(Buffer.concat(chunks))
  } catch {
    return unavailable('material read failed')
  }
}

async function readMaterialPage<P>(
  store: ToolMaterialStore<P>,
  input: Parameters<ToolMaterialStore<P>['read']>[0],
  expected: number,
): ReturnType<ToolMaterialStore<P>['read']> {
  const page = await store.read(input)
  if ('failure' in page) return page
  const { bytes, next } = page.ok
  const offset = Number(input.offset)
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > input.maxBytes ||
    offset + bytes.length > expected
  )
    return unavailable('invalid material page')
  if (next !== null && (bytes.length === 0 || next !== String(offset + bytes.length)))
    return unavailable('invalid material continuation')
  return succeed({ bytes: bytes.slice(), next })
}
