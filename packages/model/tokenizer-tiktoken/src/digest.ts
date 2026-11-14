import { createHash } from 'node:crypto'
import type { TiktokenRanks } from './resources.ts'

type ResourceValue = string | number | Readonly<{ [key: string]: ResourceValue }>

export class ResourceShapeError extends Error {
  override readonly name = 'ResourceShapeError'
}

function canonicalText(value: ResourceValue, path: string): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new ResourceShapeError(`${path} is not a non-negative safe integer`)
    return String(value)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ResourceShapeError(`${path} is not a string, an integer or an object`)
  const members = Object.keys(value)
    .toSorted()
    .map(key => {
      const member = value[key]
      if (member === undefined) throw new ResourceShapeError(`${path}.${key} is undefined`)
      return `${JSON.stringify(key)}:${canonicalText(member, `${path}.${key}`)}`
    })
  return `{${members.join(',')}}`
}

function canonicalJson(value: ResourceValue): string {
  return canonicalText(value, '$')
}

export function resourceDigest(value: ResourceValue): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

export function ranksDigest(ranks: TiktokenRanks): string {
  return resourceDigest({
    patStr: ranks.patStr,
    specialTokens: ranks.specialTokens,
    bpeRanks: ranks.bpeRanks,
  })
}
