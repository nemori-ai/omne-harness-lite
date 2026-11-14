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

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

export interface IdentifierSource {
  account(): AccountId
  organization(): OrganizationId
  login(): LoginStateId
}

function randomBody(): string {
  return [...randomBytes(26)].map(byte => ID_ALPHABET[byte % 32]).join('')
}

function emit<T>(codec: IdentityTextCodec<T>, prefix: string): T {
  const parsed = codec.parse(`${prefix}${randomBody()}`)
  if (!parsed.ok) throw new TypeError(`emitted ${prefix} text did not parse`)
  return parsed.value
}

export function randomIdentifiers(): IdentifierSource {
  return Object.freeze({
    account: () => emit(accountCodec, 'acc_'),
    organization: () => emit(organizationCodec, 'org_'),
    login: () => emit(loginStateCodec, 'lgn_'),
  })
}

export function newInvitationId(): string {
  return `inv_${randomBody()}`
}

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
