import type { Access } from '@omne-harness/legal-identity'
import type {
  ModelInvocationRef,
  ModelStreamDelta,
  ModelStreamSnapshot,
} from '@omne-harness/model-contract'
import type { StreamFrame, StreamRef } from '@omne-harness/stream-arrival'
import type { SessionObservationPorts } from './ports.ts'

export type StreamEvent = Readonly<{
  subscription: StreamSubscription
  frame: StreamFrame<ModelStreamSnapshot, ModelStreamDelta> | Readonly<{ kind: 'lost' }>
}>

export type Target = Readonly<{ reference: ModelInvocationRef; ref: StreamRef }>

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
    } catch {}
    if (!signal.aborted) deliver({ subscription: this, frame: { kind: 'lost' } })
  }
}
