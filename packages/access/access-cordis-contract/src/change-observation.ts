import type { ObservationContract } from '@omne-harness/public-contract'
import type { EndOf, FrameOf, FrameSource, OpenOf, PrincipalFor } from './contribution.ts'

export type ChangeAdmission = 'admitted' | 'denied' | 'basis-unavailable'
export type ChangeListener = Readonly<{ changed(): void; closed(): void }>

export type ChangeObservationInput<O extends ObservationContract> = Readonly<{
  /** Whether the principal may observe what the opening value names; asked on opening and before every frame. */
  admits(principal: PrincipalFor<O['identity']>, open: OpenOf<O>): Promise<ChangeAdmission>
  /** Subscribes to the changes of what the opening value names; `undefined` when no source is there. */
  subscribe(open: OpenOf<O>, listener: ChangeListener): (() => void) | undefined
  frame: FrameOf<O>
}>

const UNAVAILABLE = Object.freeze({ outcome: 'basis-unavailable' as const })
const DENIED = Object.freeze({ outcome: 'denied' as const })

async function admission<O extends ObservationContract>(
  input: ChangeObservationInput<O>,
  principal: PrincipalFor<O['identity']>,
  open: OpenOf<O>,
): Promise<ChangeAdmission> {
  try {
    const answer = await input.admits(principal, open)
    return answer === 'admitted' || answer === 'denied' ? answer : 'basis-unavailable'
  } catch {
    return 'basis-unavailable'
  }
}

/** Frames that only say "changed": one on opening, one per run of changes, each after admission holds again. */
export function createChangeObservation<O extends ObservationContract>(
  input: ChangeObservationInput<O>,
): FrameSource<O> {
  return async (context, open) => {
    const admitted = await admission(input, context.principal, open)
    if (admitted !== 'admitted') return admitted === 'denied' ? DENIED : UNAVAILABLE

    const state = { pending: true, closed: false, released: false }
    let wake: (() => void) | undefined
    const rouse = (): void => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = input.subscribe(open, {
        changed() {
          state.pending = true
          rouse()
        },
        closed() {
          state.closed = true
          rouse()
        },
      })
    } catch {
      return UNAVAILABLE
    }
    if (unsubscribe === undefined) return UNAVAILABLE
    const stop = unsubscribe

    const { signal } = context
    const release = (): void => {
      if (state.released) return
      state.released = true
      signal.removeEventListener('abort', onAbort)
      stop()
    }
    const onAbort = (): void => {
      release()
      rouse()
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()

    async function* frames(): AsyncGenerator<FrameOf<O>, EndOf<O>> {
      try {
        for (;;) {
          if (signal.aborted || state.closed) return 'unavailable'
          if (!state.pending) {
            await new Promise<void>(resolve => {
              wake = resolve
            })
            continue
          }
          state.pending = false
          const current = await admission(input, context.principal, open)
          if (current !== 'admitted') return current === 'denied' ? 'denied' : 'unavailable'
          yield input.frame
        }
      } finally {
        release()
      }
    }

    return { outcome: 'succeeded', frames: frames() }
  }
}
