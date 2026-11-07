import type { ContentReference, TextContentBlock } from '@omne-harness/content-block'
import type { DurableEvidence, Mutation, ToolBodyId } from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { Reply, ToolBodyRepresentation } from './results.ts'

export type SealedToolBody = Readonly<{
  source: ContentReference
  bodyId: ToolBodyId
  representation: ToolBodyRepresentation
  bodyBytes: string
  custody: DurableEvidence
}>

/** Trusted binding port. It accepts complete frames, never a caller-supplied storage address. */
export interface ToolBodyCustody<P> {
  preserve(
    input: Mutation<P> &
      Readonly<{
        start: ToolStartRecord
        source: DurableEvidence
        frames: readonly TextContentBlock[]
      }>,
  ): Reply<SealedToolBody>
  inspect(
    input: Mutation<P> & Readonly<{ start: ToolStartRecord }>,
  ): Reply<
    | Readonly<{ kind: 'sealed'; body: SealedToolBody }>
    | Readonly<{ kind: 'preparing' }>
    | Readonly<{ kind: 'unknown' }>
  >
}
