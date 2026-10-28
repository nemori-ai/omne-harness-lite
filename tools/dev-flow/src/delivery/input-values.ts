import { string } from '../integration/parse.ts'
import { InputError } from './protocol.ts'

/** A full Git object id: 40 (SHA-1) or 64 (SHA-256) hex digits, returned in lower case. */
export function fullSha(value: unknown, at: string): string {
  const result = string(value, at).toLowerCase()
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(result))
    throw new InputError(`${at}: full Git SHA required`)
  return result
}

/** An RFC 4122 UUID of versions 1 to 8, returned in lower case. */
export function uuid(value: unknown, at: string): string {
  const result = string(value, at)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))
    throw new InputError(`${at}: UUID required`)
  return result.toLowerCase()
}
