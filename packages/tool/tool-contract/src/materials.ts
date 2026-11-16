import type { ContentBlock } from '@omne-harness/content-block'
import type { DurableEvidence, Mutation } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { Effect, Reply, ToolRenderedResult, ToolTerminal } from './results.ts'

export type ToolCanonicalFingerprint = Readonly<{
  codec: 'tool-canonical-json-v1'
  algorithm: 'sha256'
  digest: string
  bytes: string
}>

export type ToolFinalEnvelope<B extends ContentBlock> = Readonly<{
  kind: 'final'
  result: ToolRenderedResult<B>
  terminal: ToolTerminal
  effect: Effect
}>

export type ToolPlannedFinal = ToolFinalEnvelope<ContentBlock>

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
