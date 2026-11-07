import { createHash } from 'node:crypto'
import { types } from 'node:util'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Adoption, ToolFailure } from '@omne-harness/tool-contract'
import {
  describedAdoption,
  type ToolMaterialFingerprint,
} from '@omne-harness/tool-contract/provider'

export type MaterialBytes = Readonly<{
  bytes: Uint8Array
  codec: Adoption
  fingerprint: Pick<ToolMaterialFingerprint, 'algorithm' | 'digest' | 'bytes'>
}>

export type EncodedToolMaterial = MaterialBytes & Readonly<{ fingerprint: ToolMaterialFingerprint }>

/** M02.1 canonical data after the caller has encoded its domain identities. */
export function encodeToolMaterial(value: unknown): Outcome<EncodedToolMaterial, ToolFailure> {
  try {
    const bytes = new TextEncoder().encode(encodeValue(value, new Set()))
    return succeed({
      bytes,
      codec: describedAdoption({
        owner: '@omne-harness/tool',
        name: 'tool-canonical-json-v1',
        revision: '1',
      }),
      fingerprint: {
        codec: 'tool-canonical-json-v1',
        algorithm: 'sha256',
        digest: createHash('sha256').update(bytes).digest('hex'),
        bytes: String(bytes.byteLength),
      },
    })
  } catch {
    return fail({ kind: 'invalid', field: 'material', reason: 'not canonical JSON data' })
  }
}

function encodeValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (typeof value !== 'object' || types.isProxy(value) || ancestors.has(value))
    throw new TypeError('not canonical JSON data')
  ancestors.add(value)
  try {
    return Array.isArray(value) ? encodeArray(value, ancestors) : encodeRecord(value, ancestors)
  } finally {
    ancestors.delete(value)
  }
}

function dataMember(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (descriptor === undefined || !('value' in descriptor))
    throw new TypeError('not a data property')
  return descriptor.value
}

function encodeArray(value: readonly unknown[], ancestors: Set<object>): string {
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new TypeError('not a dense data array')
  const items: string[] = []
  for (let index = 0; index < value.length; index += 1)
    items.push(encodeValue(dataMember(value, String(index)), ancestors))
  return `[${items.join(',')}]`
}

function encodeRecord(value: object, ancestors: Set<object>): string {
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError('not a plain data record')
  const keys = Reflect.ownKeys(value)
  if (!keys.every((key): key is string => typeof key === 'string'))
    throw new TypeError('not a string data key')
  return `{${keys
    .sort()
    .map(key => `${JSON.stringify(key)}:${encodeValue(dataMember(value, key), ancestors)}`)
    .join(',')}}`
}
