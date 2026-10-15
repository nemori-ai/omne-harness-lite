import { isPowerOfTwo, memoryBytes, type ScryptCost } from './memory.ts'

export const SCRYPT_SCHEME = 'scrypt'

const VERSION = 'v=1'
const MAX_PARAM_DIGITS = 16
const MAX_FIELD_BYTES = 64
const MAX_FIELD_TEXT = base64urlChars(MAX_FIELD_BYTES)
const MAX_MATERIAL_CHARS = materialCeiling()

function base64urlChars(bytes: number): number {
  const groups = Math.floor(bytes / 3) * 4
  const rest = bytes % 3
  return rest === 0 ? groups : groups + rest + 1
}

function materialCeiling(): number {
  const digits = '1'.repeat(MAX_PARAM_DIGITS)
  const params = `n=${digits},r=${digits},p=${digits},k=${digits}`
  const field = 'A'.repeat(MAX_FIELD_TEXT)
  return `$scrypt$v=1$${params}$${field}$${field}`.length
}

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
  const scheme = schemeOf(material)
  if (scheme !== 'scrypt') return scheme
  if (material.length > MAX_MATERIAL_CHARS) return 'unavailable'
  const body = bodyOf(material)
  if (body === undefined) return 'unavailable'
  return body
}

function schemeOf(material: string): 'scrypt' | DecodeFailure {
  if (!material.startsWith('$')) return 'unavailable'
  if (material === '$scrypt' || material.startsWith('$scrypt$')) return 'scrypt'
  return 'mismatch'
}

function bodyOf(material: string): DecodedMaterial | undefined {
  const parts = material.split('$')
  if (parts.length !== 6) return undefined
  const version = parts[2]
  const paramText = parts[3]
  const saltText = parts[4]
  const keyText = parts[5]
  if (version !== VERSION || paramText === undefined || saltText === undefined || keyText === undefined) {
    return undefined
  }
  const params = paramsFrom(paramText)
  if (params === undefined) return undefined
  return decodedBytes(saltText, keyText, params)
}

function paramsFrom(paramText: string): MaterialParams | undefined {
  const values = readParams(paramText)
  if (values === undefined) return undefined
  const params: MaterialParams = {
    N: values.get('n') ?? Number.NaN,
    r: values.get('r') ?? Number.NaN,
    p: values.get('p') ?? Number.NaN,
    keylen: values.get('k') ?? Number.NaN,
  }
  return paramsFit(params) ? params : undefined
}

function decodedBytes(saltText: string, keyText: string, params: MaterialParams): DecodedMaterial | undefined {
  if (saltText.length > MAX_FIELD_TEXT || keyText.length > MAX_FIELD_TEXT) return undefined
  const salt = strictBase64url(saltText)
  const key = strictBase64url(keyText)
  if (salt === undefined || key === undefined) return undefined
  if (salt.length < 16 || salt.length > 64 || key.length !== params.keylen) return undefined
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
  const match = /^n=(0|[1-9][0-9]{0,15}),r=(0|[1-9][0-9]{0,15}),p=(0|[1-9][0-9]{0,15}),k=(0|[1-9][0-9]{0,15})$/.exec(text)
  if (match === null) return undefined
  return new Map([
    ['n', Number(match[1])],
    ['r', Number(match[2])],
    ['p', Number(match[3])],
    ['k', Number(match[4])],
  ])
}

function strictBase64url(text: string): Uint8Array | undefined {
  if (text.length === 0 || !/^[A-Za-z0-9_-]+$/.test(text)) return undefined
  const bytes = Buffer.from(text, 'base64url')
  return bytes.toString('base64url') === text ? bytes : undefined
}
