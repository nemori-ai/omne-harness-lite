import type { Access } from '@omne-harness/legal-identity'
import type { StreamCursor, StreamRef } from './stream-reference.ts'

export type StreamFrame<S, D, E = never> =
  | Readonly<{ kind: 'snapshot'; cursor: StreamCursor; value: S }>
  | Readonly<{ kind: 'delta'; from: StreamCursor; cursor: StreamCursor; value: D }>
  | Readonly<{ kind: 'gap'; after: StreamCursor | null; reason: 'buffer' | 'source-history' }>
  | Readonly<{
      kind: 'ended'
      reason:
        | 'source-closed'
        | 'observer-closed'
        | 'stale-stream'
        | 'denied'
        | 'unavailable'
        | 'capacity'
    }>
  | Readonly<{ kind: 'ended'; reason: 'producer-ended'; value: E }>

export interface StreamObserver<P, S, D, E = never> {
  observe(
    input: Readonly<{ ref: StreamRef; access: Access<P>; signal: AbortSignal }>,
  ): AsyncIterable<StreamFrame<S, D, E>>
}
