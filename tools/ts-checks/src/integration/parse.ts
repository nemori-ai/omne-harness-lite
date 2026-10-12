import { createHash } from 'node:crypto'

export class IntegrationError extends Error {
  override name = 'IntegrationError'
  readonly code: 'input-error' | 'unknown' | 'refused' | 'stale' | 'invariant'
  constructor(
    code: 'input-error' | 'unknown' | 'refused' | 'stale' | 'invariant',
    message: string,
  ) {
    super(message)
    this.code = code
  }
}
export function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new IntegrationError('input-error', `${path} must be an object`)
  return value as Record<string, unknown>
}
export function fields(
  value: unknown,
  keys: readonly string[],
  path: string,
): Record<string, unknown> {
  const result = object(value, path)
  const unknown = Object.keys(result).filter(key => !keys.includes(key))
  if (unknown.length > 0)
    throw new IntegrationError('input-error', `${path}: unknown fields ${unknown.join(', ')}`)
  return result
}
export function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0'))
    throw new IntegrationError('input-error', `${path} must be a nonempty string`)
  return value
}
export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new IntegrationError('input-error', `${path} must be an array`)
  return value
}
export function strings(value: unknown, path: string): string[] {
  return array(value, path).map(item => string(item, path))
}
export function integer(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new IntegrationError('input-error', `${path} must be a positive integer`)
  return value
}
export function literal<const T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) throw new IntegrationError('input-error', `${path} must be ${expected}`)
  return expected
}
export function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  path: string,
): T[number] {
  const found = choices.find(item => item === value)
  if (found === undefined) throw new IntegrationError('input-error', `${path} unsupported value`)
  return found
}
export function sha(value: unknown, path = 'commit'): string {
  const result = string(value, path)
  if (!/^[0-9a-f]{40}$/.test(result))
    throw new IntegrationError('input-error', `${path} must be a full SHA-1`)
  return result
}
export function safePath(value: unknown, path: string): string {
  const result = string(value, path)
  if (
    result.startsWith('/') ||
    result.includes('\\') ||
    result.split('/').some(part => part === '..' || part === '.' || part === '')
  )
    throw new IntegrationError('input-error', `${path} must be a repository-relative path`)
  return result
}
export function branch(value: unknown, path = 'branch'): string {
  const result = string(value, path)
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(result) ||
    result.includes('..') ||
    result.includes('//') ||
    result.endsWith('/') ||
    result.endsWith('.') ||
    result.split('/').some(part => part.endsWith('.lock') || part.startsWith('.'))
  )
    throw new IntegrationError('input-error', `${path} is not a valid branch`)
  return result
}
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  const result = JSON.stringify(value)
  if (result === undefined) throw new IntegrationError('input-error', 'Cannot encode undefined')
  return result
}
export function same(a: unknown, b: unknown, message: string): void {
  if (canonical(a) !== canonical(b)) throw new IntegrationError('stale', message)
}
export function json(value: string, path: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new IntegrationError('input-error', `${path} contains invalid JSON`)
    throw error
  }
}
export function section(body: string, marker: string): unknown | undefined {
  const starts = [...body.matchAll(new RegExp('^```json[ \\t]+' + marker + '[ \\t]*$', 'gm'))]
  if (starts.length === 0) return undefined
  if (starts.length !== 1) throw new IntegrationError('input-error', `Duplicate ${marker} sections`)
  const start = starts[0]
  if (start === undefined) throw new IntegrationError('input-error', marker)
  const tail = body.slice(start.index + start[0].length)
  const end = /^```[ \t]*$/m.exec(tail)
  if (end === null) throw new IntegrationError('input-error', `Unclosed ${marker} section`)
  return json(tail.slice(0, end.index), marker)
}
