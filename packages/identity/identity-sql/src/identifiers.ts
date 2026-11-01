// Random identities and secrets of the provider. The owner emits lexically valid text and parses
// it like any caller (identity SPEC "已采用的纯值边界"). The login proof is 32 random bytes; the
// store keeps only its SHA-256 digest (DP3-C10).
import { createHash, randomBytes } from 'node:crypto'
import {
  accountCodec,
  loginStateCodec,
  organizationCodec,
  type AccountId,
  type IdentityTextCodec,
  type LoginStateId,
  type OrganizationId,
} from '@omne-harness/legal-identity'

// An atomic identity body is 26 characters from this 32-character alphabet, which leaves out i, l,
// o and u. 32 divides 256, so a byte modulo 32 is uniform.
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Where new account, organization and login identities come from. Tests inject a colliding one. */
export interface IdentifierSource {
  account(): AccountId
  organization(): OrganizationId
  login(): LoginStateId
}

function emit<T>(codec: IdentityTextCodec<T>, prefix: string): T {
  const body = [...randomBytes(26)].map(byte => ID_ALPHABET[byte % 32]).join('')
  const parsed = codec.parse(`${prefix}${body}`)
  if (!parsed.ok) throw new TypeError(`emitted ${prefix} text did not parse`)
  return parsed.value
}

/** Fresh random identities. */
export function randomIdentifiers(): IdentifierSource {
  return Object.freeze({
    account: () => emit(accountCodec, 'acc_'),
    organization: () => emit(organizationCodec, 'org_'),
    login: () => emit(loginStateCodec, 'lgn_'),
  })
}

/** A 128-bit random operation key, in lowercase hex. */
export function operationKey(): string {
  return randomBytes(16).toString('hex')
}

export function requestKey(): string {
  return randomBytes(8).toString('hex')
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export type LoginProof = Readonly<{ proof: string; digest: string }>

export function newLoginProof(): LoginProof {
  const proof = randomBytes(32).toString('base64url')
  return { proof, digest: sha256Hex(proof) }
}
