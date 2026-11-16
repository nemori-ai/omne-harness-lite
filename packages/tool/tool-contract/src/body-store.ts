import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolBodyId, ToolCallId, ToolIdentity, ToolInstanceId } from './identity.ts'

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

export interface ToolInstantClock {
  now(): ToolInstant
}

export type ToolBodyRef = Readonly<{ tenant: TenantId; call: ToolCallId; body: ToolBodyId }>

export type ToolBodyPermitClaims = ToolBodyRef &
  Readonly<{ instance: ToolInstanceId; generation: string; deadline: ToolInstant }>

export type ToolBodyPermit = Readonly<{ claims: ToolBodyPermitClaims; signature: string }>

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

export type ToolBodyManifest = Readonly<{ chunks: number; bytes: number; digest: string }>

export type ToolBodyChunk = Readonly<{ seq: number; bytes: Uint8Array }>

export type ToolBodyRange = Readonly<{ first: number; count: number }>

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

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

export type ToolBodyPutAnswer =
  | Readonly<{ kind: 'kept' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'permit-expired' }>
  | Readonly<{ kind: 'permit-invalid' }>
  | ToolBodyStoreUnavailable

export type ToolBodySealAnswer =
  | Readonly<{ kind: 'sealed' }>
  | Readonly<{ kind: 'not-ready'; diagnostic: string }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'permit-expired' }>
  | Readonly<{ kind: 'permit-invalid' }>
  | ToolBodyStoreUnavailable

export type ToolBodyReadAnswer =
  | Readonly<{ kind: 'found'; manifest: ToolBodyManifest; chunks: readonly ToolBodyChunk[] }>
  | Readonly<{ kind: 'absent' }>
  | ToolBodyStoreUnavailable

export type ToolBodyDeleteAnswer = Readonly<{ kind: 'deleted' }> | ToolBodyStoreUnavailable

export interface ToolBodyStore {
  readonly durability: 'none' | 'durable'
  put(permit: ToolBodyPermit, seq: number, bytes: Uint8Array): Promise<ToolBodyPutAnswer>
  seal(permit: ToolBodyPermit, manifest: ToolBodyManifest): Promise<ToolBodySealAnswer>
  read(body: ToolBodyRef, range: ToolBodyRange): Promise<ToolBodyReadAnswer>
  delete(body: ToolBodyRef): Promise<ToolBodyDeleteAnswer>
}
