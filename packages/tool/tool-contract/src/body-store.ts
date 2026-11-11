// The body store port: immutable chunks and one sealing manifest per body, written under a
// time-bounded permit that the ledger signs and the store verifies with its own clock. The store
// keeps no business state: it does not know results, expiry or authorization, and every operation
// is idempotent. The body-lifecycle model names these as `Put`, `StoreSeal`, `DeleteBytes` and
// the store-side deadline check (`PermitValid`).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolBodyId, ToolCallId, ToolIdentity, ToolInstanceId } from './identity.ts'

/** Canonical UTC text with millisecond precision. Two instants compare as text. */
export type ToolInstant = ToolIdentity<'ToolInstant'>

export function decodeToolInstant(
  value: unknown,
): Outcome<ToolInstant, Readonly<{ reason: 'canonical-utc' }>> {
  if (typeof value !== 'string') return fail({ reason: 'canonical-utc' })
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value)
    return fail({ reason: 'canonical-utc' })
  return succeed(value as ToolInstant)
}

/** A clock a participant reads for itself; the deployment bounds the skew between participants. */
export interface ToolInstantClock {
  now(): ToolInstant
}

/** The identity of one body: minted once, never reused, never shared between results. */
export type ToolBodyRef = Readonly<{ tenant: TenantId; call: ToolCallId; body: ToolBodyId }>

/** What a permit binds: the body, the execution that writes it, and the issuer's deadline. */
export type ToolBodyPermitClaims = ToolBodyRef &
  Readonly<{ instance: ToolInstanceId; generation: string; deadline: ToolInstant }>

export type ToolBodyPermit = Readonly<{ claims: ToolBodyPermitClaims; signature: string }>

/** The secret the assembly gives to the issuer and to every store of one deployment. */
export type ToolBodyPermitKey = Readonly<{ secret: Uint8Array }>

function claimsText(claims: ToolBodyPermitClaims): string {
  return JSON.stringify([
    claims.tenant.organization.text,
    claims.tenant.account.text,
    claims.call,
    claims.body,
    claims.instance,
    claims.generation,
    claims.deadline,
  ])
}

export function signBodyPermit(
  key: ToolBodyPermitKey,
  claims: ToolBodyPermitClaims,
): ToolBodyPermit {
  const signature = createHmac('sha256', key.secret).update(claimsText(claims)).digest('hex')
  return { claims, signature }
}

export type ToolBodyPermitVerdict = 'valid' | 'invalid-signature' | 'expired'

/** The store's check: the signature binds the claims, and the store's own `now` is not past the deadline. */
export function verifyBodyPermit(
  key: ToolBodyPermitKey,
  permit: ToolBodyPermit,
  now: ToolInstant,
): ToolBodyPermitVerdict {
  const expected = Buffer.from(signBodyPermit(key, permit.claims).signature, 'hex')
  const given = Buffer.from(permit.signature, 'hex')
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return 'invalid-signature'
  return now <= permit.claims.deadline ? 'valid' : 'expired'
}

/** What seals a body: the chunk count, the byte total and the SHA-256 of the concatenated bytes. */
export type ToolBodyManifest = Readonly<{ chunks: number; bytes: number; digest: string }>

export type ToolBodyChunk = Readonly<{ seq: number; bytes: Uint8Array }>

/** Chunks `first` to `first + count - 1`, by sequence number. */
export type ToolBodyRange = Readonly<{ first: number; count: number }>

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

/** The manifest that seals `chunks` in sequence order. */
export function manifestOf(chunks: readonly Uint8Array[]): ToolBodyManifest {
  const hash = createHash('sha256')
  let bytes = 0
  for (const chunk of chunks) {
    hash.update(chunk)
    bytes += chunk.length
  }
  return { chunks: chunks.length, bytes, digest: hash.digest('hex') }
}

export type ToolBodyStoreUnavailable = Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * `kept`: the chunk holds these bytes, now or already. `conflict`: the sequence number holds other
 * bytes, or the body is sealed and the sequence number lies past its manifest.
 */
export type ToolBodyPutAnswer =
  | Readonly<{ kind: 'kept' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'permit-expired' }>
  | Readonly<{ kind: 'permit-invalid' }>
  | ToolBodyStoreUnavailable

/**
 * `sealed` means the manifest and every chunk it names are durable. `not-ready`: the chunks do not
 * hold exactly what the manifest declares. `conflict`: another manifest already seals the body.
 */
export type ToolBodySealAnswer =
  | Readonly<{ kind: 'sealed' }>
  | Readonly<{ kind: 'not-ready'; diagnostic: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'permit-expired' }>
  | Readonly<{ kind: 'permit-invalid' }>
  | ToolBodyStoreUnavailable

/** `absent`: no sealed body under this reference, whether never sealed or deleted. */
export type ToolBodyReadAnswer =
  | Readonly<{ kind: 'found'; manifest: ToolBodyManifest; chunks: readonly ToolBodyChunk[] }>
  | Readonly<{ kind: 'absent' }>
  | ToolBodyStoreUnavailable

export type ToolBodyDeleteAnswer = Readonly<{ kind: 'deleted' }> | ToolBodyStoreUnavailable

export interface ToolBodyStore {
  /** `none` is a testing double; a production assembly needs `durable`. */
  readonly durability: 'none' | 'durable'
  /** Model `Put`: a conditional write under a permit the store verifies with its own clock. */
  put(permit: ToolBodyPermit, seq: number, bytes: Uint8Array): Promise<ToolBodyPutAnswer>
  /** Model `StoreSeal`: writes the manifest once the chunks hold exactly what it declares. */
  seal(permit: ToolBodyPermit, manifest: ToolBodyManifest): Promise<ToolBodySealAnswer>
  /** A keyed range read of a sealed body. Only the Tool service calls it; the assembly ensures that. */
  read(body: ToolBodyRef, range: ToolBodyRange): Promise<ToolBodyReadAnswer>
  /** Model `DeleteBytes`: removes chunks and manifest, leaves nothing behind, and is idempotent. */
  delete(body: ToolBodyRef): Promise<ToolBodyDeleteAnswer>
}
