import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Attachment, ContentPage, Reply, ToolFailure } from '@omne-harness/tool-contract'
import type {
  ToolContentReader,
  ToolMaterialSeal,
  ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { canonicalJson, digestOf } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'

export const materialStorage = '@omne-harness/tool/material'

type Input<P> = Parameters<ToolContentReader<P>['read']>[0]

export function materialContent(seal: ToolMaterialSeal): Attachment {
  return {
    storage: materialStorage,
    key: canonicalJson(seal.material),
    mediaType: 'application/octet-stream',
    bytes: seal.bytes,
    digest: `sha256:${seal.sha256}`,
  }
}

function position<P>(input: Input<P>, scope: string): Outcome<string, ToolFailure> {
  if (input.after === null) return succeed('0')
  let cursor: unknown
  try {
    cursor = JSON.parse(input.after)
  } catch {
    return fail({ kind: 'invalid-cursor', reason: 'not-a-material-cursor' })
  }
  if (typeof cursor !== 'object' || cursor === null)
    return fail({ kind: 'invalid-cursor', reason: 'not-a-material-cursor' })
  const offset: unknown = Reflect.get(cursor, 'offset')
  if (
    Object.keys(cursor).length !== 3 ||
    Reflect.get(cursor, 'version') !== 1 ||
    Reflect.get(cursor, 'scope') !== scope ||
    typeof offset !== 'string' ||
    !/^[1-9][0-9]*$/.test(offset)
  )
    return fail({ kind: 'invalid-cursor', reason: 'another-material-or-invalid-position' })
  if (BigInt(offset) >= BigInt(input.attachment.bytes))
    return fail({ kind: 'invalid-cursor', reason: 'past-the-end' })
  return succeed(offset)
}

export function materialContentSeal(
  value: Attachment,
  snapshot: Snapshot,
): Outcome<ToolMaterialSeal, ToolFailure> {
  const attachment = canonicalJson(value)
  const record = [...snapshot.materials.values()].find(
    record =>
      record.purpose === 'raw' &&
      record.state.kind === 'sealed' &&
      canonicalJson(materialContent(record.state.seal)) === attachment,
  )
  if (record === undefined || record.state.kind !== 'sealed')
    return invalid('attachment', 'not-owned-material')
  return succeed(record.state.seal)
}

export async function readMaterialContent<P>(
  input: Input<P>,
  snapshot: Snapshot,
  store: ToolMaterialStore<P> | undefined,
): Reply<ContentPage> {
  const seal = materialContentSeal(input.attachment, snapshot)
  if ('failure' in seal) return seal
  if (store === undefined)
    return fail({
      kind: 'unavailable',
      dependency: 'material-reader',
      diagnostic: 'material provider is not connected',
    })
  const scope = digestOf({
    projection: 'raw-bytes-v1',
    tenant: input.tenant,
    call: input.call,
    result: input.result,
    attachment: input.attachment,
  })
  const offset = position(input, scope)
  if ('failure' in offset) return offset
  const page = await store.read({
    principal: input.principal,
    tenant: input.tenant,
    call: input.call,
    material: seal.ok.material,
    offset: offset.ok,
    maxBytes: input.maxBytes,
  })
  if ('failure' in page) return page
  const end = BigInt(offset.ok) + BigInt(page.ok.bytes.length)
  if (page.ok.next !== null && page.ok.next !== String(end))
    return fail({
      kind: 'unavailable',
      dependency: 'material-reader',
      diagnostic: 'invalid material continuation',
    })
  return succeed({
    result: input.result,
    attachment: input.attachment,
    offset: offset.ok,
    bytes: page.ok.bytes,
    next:
      page.ok.next === null ? null : JSON.stringify({ version: 1, scope, offset: page.ok.next }),
  })
}
