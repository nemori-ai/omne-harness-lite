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
  /** Every store a reference may name; new objects go to `writeTo`. */
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

/** What a failed write of a port means to the caller of the core. */
export function writeFailure(dependency: string, failure: PortFailure) {
  return failure.kind === 'unknown' ? unknownOutcome : unavailable(dependency)
}

export function isPortFailure(failure: { kind: string }): failure is PortFailure {
  return failure.kind === 'unavailable' || failure.kind === 'unknown'
}

export function tenantText(tenant: TenantId): string | null {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : null
}

export function later(clock: MediaClock, ms: number): string {
  return new Date(Date.parse(clock.now()) + ms).toISOString()
}
