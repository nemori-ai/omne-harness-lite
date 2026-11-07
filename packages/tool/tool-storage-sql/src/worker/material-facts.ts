import type { JsonValue } from '@omne-harness/sql-contract'
import { countOf, textOf, type JsonObject } from './support.ts'

export type MaterialAddress = Readonly<{ tenant: string; call: string; material: string }>
export type MaterialDescriptor = Readonly<{
  bytes: number
  chunkBytes: number
  sha256: string
  seal: JsonValue
}>
export type MaterialWrite = MaterialAddress & Readonly<{ operation: string; digest: string }>
export type MaterialBegin = MaterialWrite &
  MaterialDescriptor &
  Readonly<{
    intent: 'material-begin'
  }>
export type MaterialChunk = MaterialWrite &
  Readonly<{ intent: 'material-chunk'; index: number; data: string }>
export type MaterialSeal = MaterialWrite & Readonly<{ intent: 'material-seal' }>
export type MaterialDelete = MaterialWrite &
  Readonly<{ intent: 'material-erase'; receipt: JsonValue }>
export type MaterialFacts = MaterialBegin | MaterialChunk | MaterialSeal | MaterialDelete

export function materialAddress(value: JsonObject): MaterialAddress | null {
  const tenant = textOf(value, 'tenant')
  const call = textOf(value, 'call')
  const material = textOf(value, 'material')
  return tenant === null || call === null || material === null ? null : { tenant, call, material }
}

export function parseMaterialFacts(value: JsonObject): MaterialFacts | null {
  const address = materialAddress(value)
  const operation = textOf(value, 'operation')
  const digest = textOf(value, 'digest')
  if (address === null || operation === null || digest === null) return null
  return parseMaterialCommand(value, { ...address, operation, digest })
}

function parseMaterialCommand(value: JsonObject, base: MaterialWrite): MaterialFacts | null {
  if (value['intent'] === 'material-erase') {
    const receipt = value['receipt']
    return receipt === undefined ? null : { ...base, intent: 'material-erase', receipt }
  }
  if (value['intent'] === 'material-seal') return { ...base, intent: 'material-seal' }
  if (value['intent'] === 'material-chunk') {
    const index = countOf(value, 'index')
    const data = value['data']
    return index === null || typeof data !== 'string'
      ? null
      : { ...base, intent: 'material-chunk', index, data }
  }
  if (value['intent'] !== 'material-begin') return null
  const descriptor = parseMaterialDescriptor(value)
  return descriptor === null ? null : { ...base, ...descriptor, intent: 'material-begin' }
}

export function parseMaterialDescriptor(value: JsonObject): MaterialDescriptor | null {
  const bytes = countOf(value, 'bytes')
  const chunkBytes = countOf(value, 'chunkBytes')
  const sha256 = textOf(value, 'sha256')
  const seal = value['seal']
  if (
    bytes === null ||
    chunkBytes === null ||
    chunkBytes === 0 ||
    sha256 === null ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    seal === undefined
  )
    return null
  return { bytes, chunkBytes, sha256, seal }
}
