import { fail } from '@omne-harness/operation-result'
import type {
  ByteStore,
  ImageCodec,
  MediaClock,
  MediaIndex,
  MediaUnavailable,
  MediaUnknown,
  Modality,
  PortFailure,
} from '@omne-harness/media-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

export type MediaConfig = Readonly<{
  /** The largest medium taken in, by modality. */
  maxBytes: Readonly<Record<Modality, number>>
  partBytes: number
  uploadTtlMs: number
  stagingTtlMs: number
  variantCacheBytes: number
}>

export type MediaDependencies = Readonly<{
  /** Every store a reference may name, read at each call; new objects go to `writeTo`. */
  stores: readonly ByteStore[]
  writeTo: string
  index: MediaIndex
  image: ImageCodec
  clock: MediaClock
  newKey(): string
  config: MediaConfig
}>

export const unavailable = (dependency: string) =>
  fail<MediaUnavailable>({ kind: 'unavailable', dependency })
export const unknownOutcome = fail<MediaUnknown>({ kind: 'outcome-unknown' })

/** What a failed call of a port means to the caller of the core: only `unknown` may have taken effect. */
export function writeFailure(dependency: string, failure: Readonly<{ kind: string }>) {
  return failure.kind === 'unknown' ? unknownOutcome : unavailable(dependency)
}

export function isPortFailure(failure: { kind: string }): failure is PortFailure {
  return failure.kind === 'unavailable' || failure.kind === 'unknown'
}

/** A tenant comes parsed from the caller: one that does not encode is a fault of the caller, not an answer. */
export function tenantText(tenant: TenantId): string {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new TypeError('media: the tenant is not a tenant identity')
  return text.value
}

export function later(clock: MediaClock, ms: number): string {
  return new Date(Date.parse(clock.now()) + ms).toISOString()
}
