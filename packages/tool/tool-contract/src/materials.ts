import type { ContentBlock } from '@omne-harness/content-block'
import type { DurableEvidence, Mutation } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { Effect, Reply, ToolRenderedResult, ToolTerminal } from './results.ts'

/** The identity of a canonical JSON value: its SHA-256 and byte length under one codec. */
export type ToolCanonicalFingerprint = Readonly<{
  codec: 'tool-canonical-json-v1'
  algorithm: 'sha256'
  digest: string
  bytes: string
}>

/** The exact final as the executor produced it, including renderer output. */
export type ToolFinalEnvelope<B extends ContentBlock> = Readonly<{
  kind: 'final'
  result: ToolRenderedResult<B>
  terminal: ToolTerminal
  effect: Effect
}>

/**
 * The final as the fact stream records it: the result already planned under its body policy, so
 * its content is the first screen and an offloaded original names the sealed body entry of the
 * call. It never carries body bytes; settlement checks and commits it without reading any store.
 */
export type ToolPlannedFinal = ToolFinalEnvelope<ContentBlock>

/** The ledger plans the final when the execution records it; the plan is what the fact stores. */
export interface ToolFinalPlanner<P, B extends ContentBlock> {
  planFinal(
    input: Mutation<P> &
      Readonly<{
        start: ToolStartRecord
        source: DurableEvidence
        final: ToolFinalEnvelope<B>
      }>,
  ): Reply<ToolPlannedFinal>
}
