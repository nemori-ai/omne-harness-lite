import { string } from './parse.ts'
import { InputError } from '../shared/input.ts'

export function fullSha(value: unknown, at: string): string {
  const result = string(value, at).toLowerCase()
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(result))
    throw new InputError(`${at}: full Git SHA required`)
  return result
}

export function sha256Hex(value: unknown, at: string): string {
  const result = string(value, at).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(result)) throw new InputError(`${at}: SHA-256 digest required`)
  return result
}

export function uuid(value: unknown, at: string): string {
  const result = string(value, at)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))
    throw new InputError(`${at}: UUID required`)
  return result.toLowerCase()
}
