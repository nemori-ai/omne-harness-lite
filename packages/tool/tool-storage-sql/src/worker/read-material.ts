import type { JsonValue } from '@omne-harness/sql-contract'
import type { ReadHandlerModule, ReadPort } from '@omne-harness/sql-contract/worker'
import {
  materialAddress,
  parseMaterialDescriptor,
  type MaterialAddress,
  type MaterialDescriptor,
} from './material-facts.ts'
import { countOf, isObject, oneRow, text, type JsonObject, type Row } from './support.ts'
import { PROTOCOL } from './schema.ts'

export const MATERIAL_READ_HANDLER = 'tool.material.read'
export const MATERIAL_PAGE_BYTES = 65_536

function page(
  address: MaterialAddress,
  input: JsonObject,
  descriptor: MaterialDescriptor,
  port: ReadPort,
): JsonValue {
  const offset = countOf(input, 'offset')
  const maxBytes = countOf(input, 'maxBytes')
  if (offset === null || maxBytes === null || maxBytes === 0 || offset > descriptor.bytes)
    return { kind: 'invalid' }
  if (offset === descriptor.bytes) return { kind: 'bytes', data: '', next: null }
  const index = Math.floor(offset / descriptor.chunkBytes)
  const within = offset % descriptor.chunkBytes
  const length = Math.min(
    maxBytes,
    MATERIAL_PAGE_BYTES,
    descriptor.chunkBytes - within,
    descriptor.bytes - offset,
  )
  const row = oneRow(
    port,
    'SELECT substr(data, ?, ?) AS data FROM tl_material_chunk WHERE tenant = ? AND call = ? AND material = ? AND idx = ? LIMIT 1',
    [
      BigInt(within + 1),
      BigInt(length),
      address.tenant,
      address.call,
      address.material,
      BigInt(index),
    ],
  )
  const bytes = row?.['data']
  if (!(bytes instanceof Uint8Array) || bytes.length !== length) return { kind: 'corrupt' }
  return {
    kind: 'bytes',
    data: Buffer.from(bytes).toString('base64'),
    next: offset + length === descriptor.bytes ? null : String(offset + length),
  }
}

function readState(
  row: Row,
  address: MaterialAddress,
  input: JsonObject,
  port: ReadPort,
): ReturnType<ReadHandlerModule['read']> {
  const state = text(row['state'])
  if (state === 'deleting' || state === 'deleted') {
    const receipt: JsonValue = JSON.parse(text(row['receipt']))
    return {
      kind: 'read',
      output: {
        kind: 'excluded',
        deleted: state === 'deleted',
        operation: text(row['delete_operation']),
        digest: text(row['delete_digest']),
        receipt,
      },
    }
  }
  if (state === 'preparing')
    return {
      kind: 'read',
      output: { kind: 'pending', operation: text(row['operation']), digest: text(row['digest']) },
    }
  const value: JsonValue = JSON.parse(text(row['descriptor']))
  const descriptor = isObject(value) ? parseMaterialDescriptor(value) : null
  if (descriptor === null || state !== 'sealed')
    return { kind: 'failed', diagnostic: 'invalid stored material' }
  return {
    kind: 'read',
    output:
      input['mode'] === 'inspect'
        ? {
            kind: 'sealed',
            operation: text(row['operation']),
            digest: text(row['digest']),
            seal: descriptor.seal,
          }
        : page(address, input, descriptor, port),
  }
}

const handler: ReadHandlerModule = {
  handler: MATERIAL_READ_HANDLER,
  protocol: PROTOCOL,
  read(input, port) {
    if (!isObject(input)) return { kind: 'failed', diagnostic: 'not a material address' }
    const address = materialAddress(input)
    if (address === null || (input['mode'] !== 'inspect' && input['mode'] !== 'bytes'))
      return { kind: 'failed', diagnostic: 'not a material read' }
    const row = oneRow(
      port,
      'SELECT state, operation, digest, descriptor, delete_operation, delete_digest, receipt FROM tl_material WHERE tenant = ? AND call = ? AND material = ? LIMIT 1',
      [address.tenant, address.call, address.material],
    )
    if (row === undefined) return { kind: 'read', output: { kind: 'unknown' } }
    return readState(row, address, input, port)
  },
}
export default handler
