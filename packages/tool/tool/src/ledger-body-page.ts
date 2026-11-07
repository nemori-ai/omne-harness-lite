import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ContentPage, Reply, ToolBodyPage, ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  TOOL_REFERENCE_MAX_LENGTH,
  type ToolBodyReader,
  type ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { invalid } from './boundary.ts'
import { digestOf } from './evidence.ts'
import { fixResultInput } from './ledger-content.ts'
import type { ResultChannels } from './ledger-result-material.ts'

export type BodyReadInput<P> = Parameters<ToolBodyReader<P>['read']>[0]
export type BodyProjection = 'text-utf8-v1' | 'body-bytes-v1'
export type StoredBody = Extract<ResultChannels['original'], { kind: 'offloaded' }>['body']
export const bodyUnavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'body-reader', diagnostic })

export function fixBodyRead<P>(input: unknown): Outcome<BodyReadInput<P>, ToolFailure> {
  const fixed = fixResultInput<P>(input, 'read-content')
  if ('failure' in fixed) return fixed
  if (typeof input !== 'object' || input === null) return invalid('input', 'type')
  const body = decodeToolBodyId(Reflect.get(input, 'bodyId'))
  if ('failure' in body) return invalid('bodyId', body.failure.reason)
  const after: unknown = Reflect.get(input, 'after')
  const maxBytes: unknown = Reflect.get(input, 'maxBytes')
  if (
    after !== null &&
    (typeof after !== 'string' || after.length === 0 || after.length > TOOL_REFERENCE_MAX_LENGTH)
  )
    return invalid('after', 'type-or-size')
  if (typeof maxBytes !== 'number' || !Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    return invalid('maxBytes', 'range')
  return succeed({ ...fixed.ok, bodyId: body.ok, after, maxBytes })
}

export function bodyPosition<P>(
  input: BodyReadInput<P>,
  body: StoredBody,
  projection: BodyProjection,
): Outcome<Readonly<{ offset: string; scope: string }>, ToolFailure> {
  const scope = digestOf({
    tenant: input.tenant,
    call: input.call,
    result: input.result,
    bodyId: input.bodyId,
    seal: body.seal,
    representation: body.description.representation,
    projection,
  })
  if (input.after === null) return succeed({ offset: '0', scope })
  let cursor: unknown
  try {
    cursor = JSON.parse(input.after)
  } catch {
    return fail({ kind: 'invalid-cursor', reason: 'not-a-body-cursor' })
  }
  if (typeof cursor !== 'object' || cursor === null || Object.keys(cursor).length !== 3)
    return fail({ kind: 'invalid-cursor', reason: 'not-a-body-cursor' })
  const offset: unknown = Reflect.get(cursor, 'offset')
  if (
    Reflect.get(cursor, 'version') !== 1 ||
    Reflect.get(cursor, 'scope') !== scope ||
    typeof offset !== 'string' ||
    !/^[1-9][0-9]*$/.test(offset) ||
    BigInt(offset) >= BigInt(body.seal.bytes)
  )
    return fail({ kind: 'invalid-cursor', reason: 'another-body-or-invalid-position' })
  return succeed({ offset, scope })
}

export async function readBodyBytes<P>(
  input: BodyReadInput<P>,
  body: StoredBody,
  position: Readonly<{ offset: string; scope: string }>,
  ports: Readonly<{ store: ToolMaterialStore<P>; maxBytes: number; authorize(): Reply<void> }>,
): Reply<ContentPage> {
  const allowed = await ports.authorize()
  if ('failure' in allowed) return allowed
  try {
    const page = await ports.store.read({
      ...input,
      material: body.seal.material,
      offset: position.offset,
      maxBytes: ports.maxBytes,
    })
    if ('failure' in page) return page
    const { bytes, next } = page.ok
    if (!(bytes instanceof Uint8Array) || bytes.length > ports.maxBytes)
      return bodyUnavailable('invalid byte page')
    const end = BigInt(position.offset) + BigInt(bytes.length)
    const total = BigInt(body.seal.bytes)
    if (
      end > total ||
      (bytes.length === 0 && total !== 0n) ||
      (end === total ? next !== null : next !== String(end))
    )
      return bodyUnavailable('invalid range or premature EOF')
    return succeed({
      result: input.result,
      attachment: { ...body.description.source },
      offset: position.offset,
      bytes: Uint8Array.from(bytes),
      next:
        next === null
          ? null
          : JSON.stringify({ version: 1, scope: position.scope, offset: String(end) }),
    })
  } catch {
    return bodyUnavailable('material byte read failed')
  }
}

export async function readBodyText<P>(
  input: BodyReadInput<P>,
  body: StoredBody,
  position: Readonly<{ offset: string; scope: string }>,
  ports: Readonly<{ store: ToolMaterialStore<P>; maxBytes: number; authorize(): Reply<void> }>,
): Reply<ToolBodyPage> {
  const { store, maxBytes } = ports
  const { representation } = body.description
  if (representation.kind !== 'text')
    return fail({
      kind: 'unsupported',
      adoption: representation.codec,
      reason: 'text body required',
    })
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    const start = BigInt(position.offset)
    const total = BigInt(body.seal.bytes)
    let scanned = 0
    for (;;) {
      const remaining = maxBytes - scanned
      const allowed = await ports.authorize()
      if ('failure' in allowed) return allowed
      const page = await store.read({
        ...input,
        material: body.seal.material,
        offset: String(start + BigInt(scanned)),
        maxBytes: remaining,
      })
      if ('failure' in page) return page
      const { bytes, next } = page.ok
      if (!(bytes instanceof Uint8Array) || bytes.length > remaining)
        return bodyUnavailable('invalid byte page')
      const end = start + BigInt(scanned) + BigInt(bytes.length)
      if (
        end > total ||
        (bytes.length === 0 && total !== 0n) ||
        (end === total ? next !== null : next !== String(end))
      )
        return bodyUnavailable('invalid range or premature EOF')
      if (scanned === 0 && start !== 0n && bytes[0] !== undefined && (bytes[0] & 0xc0) === 0x80)
        return fail({ kind: 'invalid-cursor', reason: 'not-a-character-boundary' })
      const text = decoder.decode(bytes, { stream: next !== null })
      const consumed = Buffer.byteLength(text, 'utf8')
      scanned += bytes.length
      if (consumed === 0 && total !== 0n) {
        if (scanned === maxBytes) return invalid('maxBytes', 'first-character-does-not-fit')
        continue
      }
      const offset = start + BigInt(consumed)
      return succeed({
        kind: 'text',
        result: input.result,
        bodyId: input.bodyId,
        representation,
        bodyBytes: body.description.bodyBytes,
        expiresAt: body.description.retention.expiresAt,
        position: position.offset,
        text,
        next:
          offset === total
            ? null
            : JSON.stringify({ version: 1, scope: position.scope, offset: String(offset) }),
      })
    }
  } catch {
    return bodyUnavailable('material read or UTF-8 decoding failed')
  }
}
