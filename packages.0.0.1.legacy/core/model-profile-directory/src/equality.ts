import { isJsonNumber, jsonNumberSource } from '@omne-harness-lite/content-blocks'
import type { ModelProfileContent } from '@omne-harness-lite/model-profile'

function numericKey(value: Parameters<typeof jsonNumberSource>[0]): string {
  const source = jsonNumberSource(value)
  const [mantissa = '', exponent = '0'] = source.split(/[eE]/u)
  const full = mantissa.replace(/[-.]/gu, '').replace(/^0+/u, '')
  if (full === '') return '0'
  const digits = full.replace(/0+$/u, '')
  return `${source.startsWith('-') ? '-' : ''}${digits}e${BigInt(exponent) - BigInt(mantissa.split('.')[1]?.length ?? 0) + BigInt(full.length - digits.length)}`
}
/** Comparison projection over the public JSON algebra; does not parse or replace it. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function jsonNumbersEqual(a: unknown, b: unknown): boolean {
  return isJsonNumber(a) && isJsonNumber(b) && numericKey(a) === numericKey(b)
}
function jsonArraysEqual(a: unknown, b: unknown): boolean {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v: unknown, i: number) => jsonEqual(v, b[i]))
  )
}
function jsonObjectsEqual(a: unknown, b: unknown): boolean {
  if (!record(a) || !record(b)) return false
  const ak = Object.keys(a),
    bk = Object.keys(b)
  return (
    ak.length === bk.length && ak.every(key => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
  )
}
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (isJsonNumber(a) || isJsonNumber(b)) return jsonNumbersEqual(a, b)
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return jsonArraysEqual(a, b)
  return jsonObjectsEqual(a, b)
}
function setEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every(value => b.includes(value))
}
export function upstreamEqual(a: ModelProfileContent, b: ModelProfileContent): boolean {
  return (
    setEqual(a.inputModalities, b.inputModalities) &&
    setEqual(a.outputModalities, b.outputModalities) &&
    jsonEqual(a.maxInputTokens, b.maxInputTokens) &&
    jsonEqual(a.maxOutputTokens, b.maxOutputTokens) &&
    jsonEqual(a.inputConstraints, b.inputConstraints) &&
    jsonEqual(a.upstreamInputLimits, b.upstreamInputLimits)
  )
}
export function contentEqual(a: ModelProfileContent, b: ModelProfileContent): boolean {
  return (
    a.routeName === b.routeName &&
    a.origin === b.origin &&
    upstreamEqual(a, b) &&
    jsonEqual(a.providers, b.providers) &&
    a.allowFallback === b.allowFallback &&
    jsonEqual(a.parameters, b.parameters) &&
    jsonEqual(a.adaptation, b.adaptation)
  )
}
