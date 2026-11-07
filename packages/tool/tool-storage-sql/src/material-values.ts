import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { JsonValue } from '@omne-harness/sql-contract'
import { encodeToolMaterial } from '@omne-harness/tool'
import type { Adoption, DurableEvidence, ToolFailure } from '@omne-harness/tool-contract'
import {
  decodeToolMaterialId,
  decodeToolMaterialGeneration,
  type ToolMaterialRef,
  type ToolMaterialSeal,
} from '@omne-harness/tool-contract/provider'
import { materialUnavailable } from './material-io.ts'
import { MATERIAL_PAGE_BYTES } from './worker/read-material.ts'
import { isObject, type JsonObject } from './worker/support.ts'

export function canonicalValue(
  value: unknown,
): Outcome<Readonly<{ data: JsonValue; text: string; digest: string }>, ToolFailure> {
  const encoded = encodeToolMaterial(value)
  if ('failure' in encoded) return encoded
  const text = Buffer.from(encoded.ok.bytes).toString('utf8')
  const data: JsonValue = JSON.parse(text)
  return succeed({ data, text, digest: encoded.ok.fingerprint.digest })
}

function fields(value: JsonValue | undefined, key: 'name' | 'record') {
  if (!isObject(value)) return null
  const owner = value['owner'],
    member = value[key],
    revision = value['revision'],
    digest = value['digest']
  return typeof owner === 'string' &&
    typeof member === 'string' &&
    typeof revision === 'string' &&
    typeof digest === 'string'
    ? { owner, member, revision, digest }
    : null
}
export function adoptionOf(value: JsonValue | undefined): Adoption | null {
  const found = fields(value, 'name')
  return found === null
    ? null
    : { owner: found.owner, name: found.member, revision: found.revision, digest: found.digest }
}
export function evidenceOf(value: JsonValue | undefined): DurableEvidence | null {
  const found = fields(value, 'record')
  return found === null
    ? null
    : { owner: found.owner, record: found.member, revision: found.revision, digest: found.digest }
}
export function materialOf(value: JsonValue | undefined): ToolMaterialRef | null {
  if (!isObject(value)) return null
  const id = decodeToolMaterialId(value['id'])
  const generation = decodeToolMaterialGeneration(value['generation'])
  const provider = adoptionOf(value['provider'])
  return 'failure' in id || 'failure' in generation || provider === null
    ? null
    : { id: id.ok, generation: generation.ok, provider }
}
export function sealOf(value: JsonValue | undefined): ToolMaterialSeal | null {
  if (!isObject(value)) return null
  const material = materialOf(value['material']),
    codec = adoptionOf(value['codec']),
    evidence = evidenceOf(value['evidence'])
  const bytes = value['bytes'],
    sha256 = value['sha256']
  if (
    material === null ||
    codec === null ||
    evidence === null ||
    typeof bytes !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(bytes) ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sha256)
  )
    return null
  return { material, codec, evidence, bytes, sha256 }
}
export function materialSnapshot(value: ToolMaterialRef) {
  const encoded = canonicalValue(value)
  if ('failure' in encoded) return encoded
  const material = materialOf(encoded.ok.data)
  if (material === null)
    return fail({ kind: 'invalid', field: 'material', reason: 'identity' } as const)
  const identity = canonicalValue(material)
  return 'failure' in identity ? identity : succeed({ material, key: identity.ok.text })
}
export function snapshotWriteMetadata(
  value: Readonly<{ codec: Adoption; source: DurableEvidence }>,
) {
  const encoded = canonicalValue(value)
  if ('failure' in encoded) return encoded
  if (!isObject(encoded.ok.data))
    return fail({ kind: 'invalid', field: 'material', reason: 'metadata' } as const)
  const codec = adoptionOf(encoded.ok.data['codec']),
    source = evidenceOf(encoded.ok.data['source'])
  return codec === null || source === null
    ? fail({ kind: 'invalid', field: 'material', reason: 'metadata' } as const)
    : succeed({ codec, source })
}

export function decodeMaterialPage(row: JsonObject, offset: number, maxBytes: number) {
  if (row['kind'] === 'invalid')
    return fail({ kind: 'invalid', field: 'offset', reason: 'outside material' } as const)
  if (row['kind'] !== 'bytes' || typeof row['data'] !== 'string')
    return materialUnavailable('material bytes unavailable')
  const limit = Math.min(maxBytes, MATERIAL_PAGE_BYTES)
  if (row['data'].length > 4 * Math.ceil(limit / 3))
    return materialUnavailable('material page exceeds byte limit')
  const bytes = Buffer.from(row['data'], 'base64'),
    next = row['next']
  if (
    bytes.toString('base64') !== row['data'] ||
    bytes.length > limit ||
    (next !== null && (bytes.length === 0 || next !== String(offset + bytes.length)))
  )
    return materialUnavailable('invalid material page')
  return succeed({ bytes: new Uint8Array(bytes), next })
}

export type MaterialObservation =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'pending'; operation: string; digest: string }>
  | Readonly<{ kind: 'sealed'; operation: string; digest: string; seal: ToolMaterialSeal }>
  | Readonly<{
      kind: 'excluded'
      operation: string
      digest: string
      deleted: boolean
      receipt: DurableEvidence
    }>

export function decodeMaterialObservation(
  row: JsonObject,
): Outcome<MaterialObservation, ToolFailure> {
  if (row['kind'] === 'unknown') return succeed({ kind: 'unknown' })
  const operation = row['operation'],
    digest = row['digest']
  if (typeof operation !== 'string' || typeof digest !== 'string')
    return materialUnavailable('invalid material observation identity')
  switch (row['kind']) {
    case 'pending':
      return succeed({ kind: 'pending', operation, digest })
    case 'sealed': {
      const seal = sealOf(row['seal'])
      return seal === null
        ? materialUnavailable('invalid material inspection seal')
        : succeed({ kind: 'sealed', operation, digest, seal })
    }
    case 'excluded': {
      const receipt = evidenceOf(row['receipt']),
        deleted = row['deleted']
      return receipt === null || typeof deleted !== 'boolean'
        ? materialUnavailable('invalid material fence')
        : succeed({ kind: 'excluded', operation, digest, receipt, deleted })
    }
    default:
      return materialUnavailable('unknown material observation')
  }
}
