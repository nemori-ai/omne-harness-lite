import { createHash, type Hash } from 'node:crypto'
import {
  isJsonNumber,
  jsonNumberSource,
  type JsonNumber,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { isObject, snapshot } from './json.ts'
import type { ModelCallSemanticDigest, ModelCallSemanticDigestRole } from './types.ts'

export type ModelCallSemanticDigestJudgment =
  { readonly ok: ModelCallSemanticDigest } | { readonly rejected: 'malformed' }

const CREATION_ROLE = 'model-call-creation-semantic-sha256/v1'
const RESULT_ROLE = 'model-call-retained-result-semantic-sha256/v1'

/** MS8 S-56: one owned encoding for creation and retained-result roles. */
export function createModelCallSemanticDigest(
  role: ModelCallSemanticDigestRole,
  value: unknown,
): ModelCallSemanticDigestJudgment {
  if (role !== CREATION_ROLE && role !== RESULT_ROLE)
    return Object.freeze({ rejected: 'malformed' as const })
  const owned = snapshot(value)
  if (owned === undefined) return Object.freeze({ rejected: 'malformed' as const })
  const hash = createHash('sha256')
  hash.update(`[${JSON.stringify(role)},`)
  encode(owned, hash)
  hash.update(']')
  return Object.freeze({ ok: Object.freeze({ role, hex: hash.digest('hex') }) })
}

export function judgeModelCallSemanticDigest(
  role: ModelCallSemanticDigestRole,
  value: unknown,
  digest: unknown,
): ModelCallSemanticDigestJudgment {
  const expected = createModelCallSemanticDigest(role, value)
  if ('rejected' in expected) return expected
  const candidate = snapshot(digest)
  if (
    !isObject(candidate) ||
    Object.keys(candidate).length !== 2 ||
    candidate.role !== role ||
    candidate.hex !== expected.ok.hex
  )
    return Object.freeze({ rejected: 'malformed' as const })
  return expected
}

function encode(value: JsonValue, hash: Hash): void {
  if (value === null) {
    hash.update('["z"]')
  } else if (typeof value === 'boolean') {
    hash.update(value ? '["b",1]' : '["b",0]')
  } else if (typeof value === 'string') {
    encodeString(value, hash)
  } else if (isJsonNumber(value)) {
    encodeNumber(value, hash)
  } else if (Array.isArray(value)) {
    hash.update('["a",[')
    value.forEach((item, index) => {
      if (index !== 0) hash.update(',')
      encode(item, hash)
    })
    hash.update(']]')
  } else if (isObject(value)) {
    hash.update('["o",[')
    Object.keys(value)
      .sort()
      .forEach((key, index) => {
        if (index !== 0) hash.update(',')
        hash.update('[')
        encodeString(key, hash)
        hash.update(',')
        const item = value[key]
        if (item === undefined) throw new Error('owned JSON object lost a value')
        encode(item, hash)
        hash.update(']')
      })
    hash.update(']]')
  }
}

function encodeString(value: string, hash: Hash): void {
  hash.update('["s",[')
  for (let index = 0; index < value.length; index++) {
    if (index !== 0) hash.update(',')
    hash.update(String(value.charCodeAt(index)))
  }
  hash.update(']]')
}

function encodeNumber(value: JsonNumber, hash: Hash): void {
  const source = jsonNumberSource(value)
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source)
  if (match === null) throw new Error('owned JSON number lost its grammar')
  const fraction = match[3] ?? ''
  const digits = `${match[2]}${fraction}`.replace(/^0+/, '')
  if (digits.length === 0) {
    hash.update('["d","+","0","0"]')
    return
  }
  const coefficient = digits.replace(/0+$/, '')
  const trailingZeros = digits.length - coefficient.length
  const exponent = BigInt(match[4] ?? '0') - BigInt(fraction.length) + BigInt(trailingZeros)
  hash.update(`["d","${match[1] === '-' ? '-' : '+'}","${coefficient}","${exponent}"]`)
}
