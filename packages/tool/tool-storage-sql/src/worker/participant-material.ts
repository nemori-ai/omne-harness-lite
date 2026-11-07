import { createHash } from 'node:crypto'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { ParticipantPort, ParticipantReply } from '@omne-harness/sql-contract/worker'
import {
  parseMaterialDescriptor,
  type MaterialAddress,
  type MaterialChunk,
  type MaterialDescriptor,
  type MaterialFacts,
  type MaterialWrite,
} from './material-facts.ts'
import { deleteMaterial } from './material-delete.ts'
import { isObject, oneRow, text, type Row } from './support.ts'

export const materialKey = (value: MaterialAddress) =>
  [value.tenant, value.call, value.material] as const
const conflict = (): ParticipantReply => ({ kind: 'conflict', basis: { reason: 'material' } })
const participated = (response: JsonValue): ParticipantReply => ({ kind: 'participated', response })

function descriptorOf(encoded: string): MaterialDescriptor {
  const value: JsonValue = JSON.parse(encoded)
  const descriptor = isObject(value) ? parseMaterialDescriptor(value) : null
  if (descriptor === null) throw new TypeError('invalid stored material descriptor')
  return descriptor
}

function chunk(
  facts: MaterialChunk,
  descriptor: MaterialDescriptor,
  port: ParticipantPort,
  sealed: boolean,
): ParticipantReply {
  const data = Buffer.from(facts.data, 'base64')
  const offset = facts.index * descriptor.chunkBytes
  const expected = Math.min(descriptor.chunkBytes, descriptor.bytes - offset)
  if (
    !Number.isSafeInteger(offset) ||
    expected <= 0 ||
    data.length !== expected ||
    data.toString('base64') !== facts.data
  )
    return conflict()
  const key = [...materialKey(facts), BigInt(facts.index)]
  const existing = oneRow(
    port,
    'SELECT data FROM tl_material_chunk WHERE tenant = ? AND call = ? AND material = ? AND idx = ? LIMIT 1',
    key,
  )
  if (existing !== undefined) {
    const bytes = existing['data']
    return bytes instanceof Uint8Array && data.equals(bytes)
      ? participated({ kind: 'chunk' })
      : conflict()
  }
  if (sealed) return conflict()
  port.execute(
    'INSERT INTO tl_material_chunk (tenant, call, material, idx, data) VALUES (?, ?, ?, ?, ?)',
    [...key, data],
  )
  return participated({ kind: 'chunk' })
}

function seal(
  facts: MaterialAddress,
  descriptor: MaterialDescriptor,
  port: ParticipantPort,
): ParticipantReply {
  const key = materialKey(facts)
  const hash = createHash('sha256')
  let bytes = 0
  for (let index = 0; index < Math.ceil(descriptor.bytes / descriptor.chunkBytes); index += 1) {
    const row = oneRow(
      port,
      'SELECT data FROM tl_material_chunk WHERE tenant = ? AND call = ? AND material = ? AND idx = ? LIMIT 1',
      [...key, BigInt(index)],
    )
    const data = row?.['data']
    if (!(data instanceof Uint8Array)) return conflict()
    hash.update(data)
    bytes += data.length
  }
  if (bytes !== descriptor.bytes || hash.digest('hex') !== descriptor.sha256) return conflict()
  port.execute(
    "UPDATE tl_material SET state = 'sealed' WHERE tenant = ? AND call = ? AND material = ?",
    key,
  )
  return participated({ kind: 'sealed', answer: descriptor.seal })
}

function matchesWrite(current: Row, facts: MaterialWrite, state: string): boolean {
  return (
    (state === 'preparing' || state === 'sealed') &&
    text(current['operation']) === facts.operation &&
    text(current['digest']) === facts.digest
  )
}

export function commitMaterial(facts: MaterialFacts, port: ParticipantPort): ParticipantReply {
  if (facts.intent === 'material-erase') return deleteMaterial(facts, port)
  const key = materialKey(facts)
  const current = oneRow(
    port,
    'SELECT operation, digest, state, descriptor FROM tl_material WHERE tenant = ? AND call = ? AND material = ? LIMIT 1',
    key,
  )
  if (current === undefined) {
    if (facts.intent !== 'material-begin') return conflict()
    port.execute(
      `INSERT INTO tl_material
      (tenant, call, material, operation, digest, state, descriptor)
      VALUES (?, ?, ?, ?, ?, 'preparing', ?)`,
      [
        ...key,
        facts.operation,
        facts.digest,
        JSON.stringify({
          bytes: facts.bytes,
          chunkBytes: facts.chunkBytes,
          sha256: facts.sha256,
          seal: facts.seal,
        }),
      ],
    )
    return participated({ kind: 'prepared', chunkBytes: facts.chunkBytes })
  }
  const state = text(current['state'])
  if (!matchesWrite(current, facts, state)) return conflict()
  const descriptor = descriptorOf(text(current['descriptor']))
  switch (facts.intent) {
    case 'material-begin':
      return state === 'sealed'
        ? participated({ kind: 'sealed', answer: descriptor.seal })
        : participated({ kind: 'prepared', chunkBytes: descriptor.chunkBytes })
    case 'material-chunk':
      return chunk(facts, descriptor, port, state === 'sealed')
    case 'material-seal':
      return state === 'sealed'
        ? participated({ kind: 'sealed', answer: descriptor.seal })
        : seal(facts, descriptor, port)
    default: {
      const exhaustive: never = facts
      return exhaustive
    }
  }
}
