import { judgePart } from '@omne-harness/message'
import type { ResultPart, ResultPage, ResultTrim, Settlement } from '../index.ts'
import { ScriptedModelError } from './error.ts'

function denseArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (let index = 0; index < value.length; index += 1)
    if (!Object.hasOwn(value, index)) return false
  return true
}

export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (!denseArray(value))
      throw new ScriptedModelError('invalid-script', 'result arrays must be dense')
    return `[${value.map(canonical).join(',')}]`
  }
  if (typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => {
        const entry = Object.getOwnPropertyDescriptor(value, key)
        if (!entry || !('value' in entry))
          throw new ScriptedModelError('invalid-script', 'result values must be data')
        return `${JSON.stringify(key)}:${canonical(entry.value)}`
      })
      .join(',')}}`
  throw new ScriptedModelError('invalid-script', 'result values must be finite data')
}
export function encodedBytes(value: unknown): number {
  return Buffer.byteLength(canonical(value), 'utf8')
}
export function pageEnd(
  parts: readonly ResultPart[],
  offset: number,
  pageSize: number,
  target: number,
): number {
  let end = Math.min(offset + 1, parts.length)
  while (
    end < parts.length &&
    end - offset < pageSize &&
    encodedBytes(parts.slice(offset, end + 1)) <= target
  )
    end += 1
  return end
}
export function resultPage(
  parts: readonly ResultPart[],
  offset: number,
  pageSize: number,
  target: number,
  settlement: Settlement,
): ResultPage {
  const end = pageEnd(parts, offset, pageSize, target)
  return {
    parts: parts.slice(offset, end),
    next: end < parts.length ? String(end) : null,
    settlement,
  }
}
function invalidTrim(trim: ResultTrim): boolean {
  return (
    !trim ||
    Object.keys(trim).some(key => key !== 'removed' && key !== 'reason') ||
    typeof trim.removed !== 'string' ||
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(trim.removed) ||
    typeof trim.reason !== 'string' ||
    !trim.reason
  )
}
function validateSealedPart(part: Extract<ResultPart, { kind: 'sealed' }>): void {
  const judged = judgePart(part.block)
  if (
    'rejected' in judged ||
    (part.block.kind === 'tool_call' && part.trims.length > 0) ||
    !['text', 'thinking', 'voice', 'image', 'file', 'tool_call'].includes(part.block.kind)
  )
    throw new ScriptedModelError('invalid-script', 'invalid sealed result')
}
function validatePartialPart(part: ResultPart): void {
  if (
    part.kind !== 'partial' ||
    !['text', 'thinking', 'voice', 'tool-arguments'].includes(part.content) ||
    typeof part.value !== 'string'
  )
    throw new ScriptedModelError('invalid-script', 'invalid partial result')
}
function validatePart(part: ResultPart): void {
  if (!part || typeof part !== 'object' || !denseArray(part.trims))
    throw new ScriptedModelError('invalid-script', 'invalid result part')
  const keys =
    part.kind === 'sealed' ? ['kind', 'block', 'trims'] : ['kind', 'content', 'value', 'trims']
  if (Object.keys(part).some(key => !keys.includes(key)))
    throw new ScriptedModelError('invalid-script', 'unknown result part field')
  if (part.trims.some(invalidTrim))
    throw new ScriptedModelError('invalid-script', 'invalid result trim')
  if (part.kind === 'sealed') validateSealedPart(part)
  else validatePartialPart(part)
}
export function validateParts(parts: readonly ResultPart[]): void {
  if (!denseArray(parts))
    throw new ScriptedModelError('invalid-script', 'parts must be a dense array')
  for (const part of parts) validatePart(part)
}
