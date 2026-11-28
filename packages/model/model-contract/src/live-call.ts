import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelModality } from './profile.ts'
import type { ControlState, Reply } from './result.ts'
import type { Adoption, CallAccess, ModelOperationId, Mutation } from './root.ts'

export const LIVE_REPRESENTATION: Adoption = Object.freeze({
  owner: 'model-contract',
  name: 'live-call',
  revision: '1',
  digest: '74b588367ebce75ea386cefbfb9b1b1ddcac4bba15e0841ce1af35c5e8da5974',
})

/** One thing the consumer says into an open live call. Its identity is the operation it is sent with. */
export type LiveCommand = Readonly<{
  type: 'say'
  use: 'directive' | 'context' | 'speak'
  about: string | null
  content: readonly ContentBlock[]
}>

export type LiveCommandOutcome =
  | 'accepted'
  | Readonly<{ rejected: Readonly<{ code: string | null; message: string }> }>

/** A command taken now, or one already seen with its outcome so far. The outcome itself comes as an event. */
export type LiveCommandReceipt =
  | Readonly<{ state: 'taken' }>
  | Readonly<{ state: 'seen'; outcome: LiveCommandOutcome | 'pending' }>

export type LivePhaseRefusal = 'not-open' | 'closing' | 'settled'

/** Something that happened upstream while the call ran. Times in ms are on the upstream audio clock. */
export type LiveEvent =
  | Readonly<{ t: 'started'; expiresAt: string | null }>
  | Readonly<{
      t: 'transcript'
      who: 'caller' | 'model'
      startMs: number
      endMs: number
      text: string
    }>
  | Readonly<{ t: 'delegation'; id: string; offsetMs: number }>
  | Readonly<{ t: 'asleep'; on: boolean }>
  | Readonly<{ t: 'command'; id: ModelOperationId; outcome: LiveCommandOutcome }>

/** An event with its number and the moment Model received it, or the run of numbers dropped there. */
export type LiveFrame =
  | Readonly<{ seq: number; at: string; event: LiveEvent }>
  | Readonly<{ gap: Readonly<{ from: number; to: number }> }>

export type MediaFrame = Readonly<{ modality: ModelModality; bytes: Uint8Array }>
export type MediaWrite = 'sent' | 'dropped' | Readonly<{ refused: 'modality' }>

/** The media of one open call; frames are neither numbered nor kept. */
export type LiveMedia = Readonly<{
  write(frame: MediaFrame): MediaWrite
  frames: AsyncIterable<MediaFrame>
  release(): void
}>

/** What a consumer does while its live call runs; events come back by the result push, not here. */
export interface ModelLiveCalls<P> {
  command(input: Mutation<P> & Readonly<{ command: LiveCommand }>): Reply<LiveCommandReceipt>
  end(input: Mutation<P>): Reply<ControlState>
  media(input: CallAccess<P>): Reply<LiveMedia>
}
