import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { RawOutput } from './custody.ts'
import type { Adoption, CallAccess, DurableEvidence, Mutation, ToolIdentity } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { Effect, Reply, ToolRenderedResult, ToolTerminal } from './results.ts'

/** M02.1: identity of the canonical bytes, independent of their storage address and lifetime. */
export type ToolMaterialFingerprint = Readonly<{
  codec: 'tool-canonical-json-v1'
  algorithm: 'sha256'
  digest: string
  bytes: string
}>

export type ToolMaterialInstant = ToolIdentity<'ToolMaterialInstant'>

/** Canonical UTC text with millisecond precision; no alternate spelling of the same instant. */
export function decodeToolMaterialInstant(
  value: unknown,
): Outcome<ToolMaterialInstant, Readonly<{ reason: 'canonical-utc' }>> {
  if (typeof value !== 'string') return fail({ reason: 'canonical-utc' })
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value)
    return fail({ reason: 'canonical-utc' })
  return succeed(value as ToolMaterialInstant)
}

/** Samples time only. The original call domain owns the persistent high watermark (M05). */
export interface ToolMaterialClock {
  sample(): Reply<ToolMaterialInstant>
}

export type ToolMaterialId = ToolIdentity<'ToolMaterialId'>
export type ToolMaterialGeneration = ToolIdentity<'ToolMaterialGeneration'>
export type ToolMaterialRef = Readonly<{
  id: ToolMaterialId
  generation: ToolMaterialGeneration
  provider: Adoption
}>
export type ToolMaterialSeal = Readonly<{
  material: ToolMaterialRef
  codec: Adoption
  bytes: string
  sha256: string
  evidence: DurableEvidence
}>

export type ToolMaterialDeletion =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'deleted'; receipt: DurableEvidence }>

/** Immutable bytes and a persistent object fence. Uses, TTL and deletion authority belong to Tool. */
export interface ToolMaterialStore<P> {
  write(
    input: Mutation<P> &
      Readonly<{
        material: ToolMaterialRef
        codec: Adoption
        source: DurableEvidence
        bytes: Uint8Array
      }>,
  ): Reply<ToolMaterialSeal>
  inspect(
    input: Mutation<P> & Readonly<{ material: ToolMaterialRef }>,
  ): Reply<
    | Readonly<{ kind: 'sealed'; seal: ToolMaterialSeal }>
    | Readonly<{ kind: 'pending' | 'unknown' }>
    | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>
  >
  read(
    input: CallAccess<P> &
      Readonly<{
        material: ToolMaterialRef
        offset: string
        maxBytes: number
      }>,
  ): Reply<Readonly<{ bytes: Uint8Array; next: string | null }>>
  erase(
    input: Mutation<P> &
      Readonly<{
        material: ToolMaterialRef
        authorization: DurableEvidence
      }>,
  ): Reply<ToolMaterialDeletion>
  inspectErase(
    input: Mutation<P> & Readonly<{ material: ToolMaterialRef }>,
  ): Reply<
    | Readonly<{ kind: 'deleted'; receipt: DurableEvidence }>
    | Readonly<{ kind: 'pending' | 'unknown' }>
  >
}

/** The exact final, including renderer output. Re-executing a renderer cannot reconstruct it. */
export type ToolFinalEnvelope<B extends ContentBlock> = Readonly<{
  kind: 'final'
  raw: RawOutput
  result: ToolRenderedResult<B>
  terminal: ToolTerminal
  effect: Effect
}>
export type ToolFinalPointer = Readonly<{
  kind: 'final'
  raw: RawOutput
  terminal: ToolTerminal
  effect: Effect
  value: ToolMaterialFingerprint
  envelope: ToolMaterialSeal
}>
export interface ToolFinalCustody<P, B extends ContentBlock> {
  preserveFinal(
    input: Mutation<P> &
      Readonly<{
        start: ToolStartRecord
        source: DurableEvidence
        final: ToolFinalEnvelope<B>
      }>,
  ): Reply<ToolFinalPointer>
}
