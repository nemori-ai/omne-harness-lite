import { isPowerOfTwo, memoryBytes, type ScryptCost } from './memory.ts'

export const SCRYPT_SCHEME = 'scrypt'

const VERSION = 'v=1'
const DECIMAL = /^(0|[1-9][0-9]{0,15})$/

export interface MaterialParams extends ScryptCost {
  readonly keylen: number
}

export interface DecodedMaterial {
  readonly params: MaterialParams
  readonly salt: Uint8Array
  readonly key: Uint8Array
}

export type DecodeFailure = 'mismatch' | 'unavailable'

export function encodeMaterial(params: MaterialParams, salt: Uint8Array, key: Uint8Array): string {
  return [
    '',
    SCRYPT_SCHEME,
    VERSION,
    `n=${params.N},r=${params.r},p=${params.p},k=${params.keylen}`,
    Buffer.from(salt).toString('base64url'),
    Buffer.from(key).toString('base64url'),
  ].join('$')
}

export function decodeMaterial(material: string): DecodedMaterial | DecodeFailure {
  if (!material.startsWith('$')) return 'unavailable'
  const parts = material.split('$')
  if (parts.length < 2 || parts[1] !== SCRYPT_SCHEME) return 'mismatch'
  if (parts.length !== 6) return 'unavailable'
  const version = parts[2]
  const paramText = parts[3]
  const saltText = parts[4]
  const keyText = parts[5]
  if (version !== VERSION || paramText === undefined || saltText === undefined || keyText === undefined) {
    return 'unavailable'
  }
  const values = readParams(paramText)
  if (values === undefined) return 'unavailable'
  const params: MaterialParams = {
    N: values.get('n') ?? Number.NaN,
    r: values.get('r') ?? Number.NaN,
    p: values.get('p') ?? Number.NaN,
    keylen: values.get('k') ?? Number.NaN,
  }
  if (!paramsFit(params)) return 'unavailable'
  const salt = strictBase64url(saltText)
  const key = strictBase64url(keyText)
  if (salt === undefined || key === undefined) return 'unavailable'
  if (salt.length < 16 || salt.length > 64 || key.length !== params.keylen) return 'unavailable'
  return { params, salt, key }
}

function paramsFit(params: MaterialParams): boolean {
  return (
    isPowerOfTwo(params.N) &&
    Number.isSafeInteger(params.r) &&
    params.r >= 1 &&
    Number.isSafeInteger(params.p) &&
    params.p >= 1 &&
    Number.isSafeInteger(params.keylen) &&
    params.keylen >= 16 &&
    params.keylen <= 64 &&
    memoryBytes(params) !== undefined
  )
}

function readParams(text: string): Map<string, number> | undefined {
  const fields = text.split(',')
  if (fields.length !== 4) return undefined
  const values = new Map<string, number>()
  for (const field of fields) {
    const splitAt = field.indexOf('=')
    if (splitAt <= 0) return undefined
    const key = field.slice(0, splitAt)
    const value = field.slice(splitAt + 1)
    if (!DECIMAL.test(value) || values.has(key)) return undefined
    values.set(key, Number(value))
  }
  if (!values.has('n') || !values.has('r') || !values.has('p') || !values.has('k')) return undefined
  return values
}

function strictBase64url(text: string): Uint8Array | undefined {
  if (text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text)) return undefined
  const bytes = Buffer.from(text, 'base64url')
  return bytes.toString('base64url') === text ? bytes : undefined
}
