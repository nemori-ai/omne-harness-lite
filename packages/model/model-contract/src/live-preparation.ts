import type { Message } from '@omne-harness/message'
import type { Reply } from './result.ts'
import type { Access, Adoption, LiveModelRequest } from './root.ts'

/** Forms the fixed request of one live call. The call is then admitted as any model call is. */
export interface ModelLivePreparation<P> {
  prepare(
    input: Access<P> &
      Readonly<{
        model: string
        instructions: string
        history?: readonly Message[]
        voice?: string
        source: Adoption
      }>,
  ): Reply<LiveModelRequest>
}
