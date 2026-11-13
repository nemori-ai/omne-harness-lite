// 流的订阅 (RFC-0015 §8, §13): one subscription to one target stream, with an abort signal of its
// own. Every frame it hands over carries the subscription, so the observation can tell a late frame
// of an old target from a frame of the current one.
import type { Access } from '@omne-harness/legal-identity'
import type { ModelStreamDelta, ModelStreamSnapshot } from '@omne-harness/model-contract'
import type { StreamFrame, StreamRef } from '@omne-harness/stream-arrival'
import type { SessionObservationPorts } from './ports.ts'

/** What a subscription hands over: a frame of the producer, or that the stream went away without an `ended`. */
export type StreamEvent = Readonly<{
  subscription: StreamSubscription
  frame: StreamFrame<ModelStreamSnapshot, ModelStreamDelta> | Readonly<{ kind: 'lost' }>
}>

export type Target = Readonly<{ reference: string; ref: StreamRef }>

export class StreamSubscription {
  readonly target: Target
  readonly #controller = new AbortController()

  constructor(
    target: Target,
    observer: SessionObservationPorts<unknown>['observer'],
    access: Access<unknown>,
    deliver: (event: StreamEvent) => void,
  ) {
    this.target = target
    void this.#pump(observer, access, deliver)
  }

  /** Stops this subscription only. The Model call goes on as the Model decides. */
  drop(): void {
    this.#controller.abort()
  }

  async #pump(
    observer: SessionObservationPorts<unknown>['observer'],
    access: Access<unknown>,
    deliver: (event: StreamEvent) => void,
  ): Promise<void> {
    const signal = this.#controller.signal
    try {
      const frames = observer.observe({ ref: this.target.ref, access, signal })
      for await (const frame of frames) {
        if (signal.aborted) return
        deliver({ subscription: this, frame })
        if (frame.kind === 'ended') return
      }
    } catch {
      // A thrown iterator is a target that is not available: the same as a stream that just stops.
    }
    if (!signal.aborted) deliver({ subscription: this, frame: { kind: 'lost' } })
  }
}
